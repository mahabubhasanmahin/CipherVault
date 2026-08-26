"""
CipherVault - Flask Backend
Entry point: wires up MongoDB, JWT auth (with role claims), and the
encryption/vault/share/admin routes.
"""
import os
import re
import uuid
import datetime
from flask import Flask, request, jsonify
from flask_cors import CORS
from flask_bcrypt import Bcrypt
from flask_jwt_extended import (
    JWTManager, create_access_token, jwt_required, get_jwt_identity, get_jwt
)
from pymongo import MongoClient, ASCENDING
from pymongo.errors import PyMongoError, DuplicateKeyError
from dotenv import load_dotenv

from utils.crypto_helpers import encrypt_blob, decrypt_blob, generate_share_token
from utils.auth_helpers import admin_required

load_dotenv()

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------
app = Flask(__name__)

# Explicit CORS: allow any origin to call /api/*, including preflight OPTIONS.
# (A bare CORS(app) sometimes fails to attach headers to error responses,
# which is what made failed signup/login calls look like silent CORS errors
# in the browser console instead of showing the real error message.)
CORS(
    app,
    resources={r"/api/*": {"origins": "*"}},
    supports_credentials=False,
    allow_headers=["Content-Type", "Authorization"],
    methods=["GET", "POST", "DELETE", "OPTIONS"],
)

app.config["JWT_SECRET_KEY"] = os.environ.get("JWT_SECRET_KEY", "change-me-in-production")
app.config["JWT_ACCESS_TOKEN_EXPIRES"] = datetime.timedelta(hours=12)

jwt = JWTManager(app)
bcrypt = Bcrypt(app)

MONGO_URI = os.environ.get("MONGO_URI", "mongodb://localhost:27017/ciphervault")
ADMIN_EMAIL = os.environ.get("ADMIN_EMAIL", "").strip().lower()
ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD", "")

EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")

DB_OK = False
DB_ERROR = ""

try:
    client = MongoClient(MONGO_URI, serverSelectionTimeoutMS=8000)
    db = client.get_default_database()
    users_col = db["users"]
    vault_col = db["vault_items"]     # encrypted blobs / metadata, never plaintext
    shares_col = db["share_links"]    # token -> vault_item reference + expiry

    # Enforce email uniqueness at the DB level too (prevents duplicate-signup
    # races, and makes the actual failure reason clear if it happens).
    users_col.create_index([("email", ASCENDING)], unique=True)

    client.admin.command("ping")
    DB_OK = True
except PyMongoError as e:
    # Don't crash on import — surface the real reason through /api/health
    # and every route instead of a bare 500 with no message.
    DB_ERROR = str(e)
    print(f"[CipherVault] MongoDB connection failed at startup: {e}")


def db_guard():
    """Call at the top of any DB-touching route; returns a response to
    short-circuit with if the DB isn't reachable, else None."""
    if not DB_OK:
        return jsonify({"error": f"database unreachable: {DB_ERROR}"}), 503
    return None


def bootstrap_admin():
    """Create the admin account from env vars if it doesn't exist yet."""
    if not DB_OK or not ADMIN_EMAIL or not ADMIN_PASSWORD:
        return
    if users_col.find_one({"email": ADMIN_EMAIL}):
        return
    pw_hash = bcrypt.generate_password_hash(ADMIN_PASSWORD).decode("utf-8")
    users_col.insert_one({
        "_id": str(uuid.uuid4()),
        "email": ADMIN_EMAIL,
        "password_hash": pw_hash,
        "role": "admin",
        "created_at": datetime.datetime.utcnow(),
    })
    print(f"[CipherVault] Admin account ready: {ADMIN_EMAIL}")


bootstrap_admin()


# ---------------------------------------------------------------------------
# Auth routes
# ---------------------------------------------------------------------------
@app.route("/api/auth/signup", methods=["POST"])
def signup():
    guard = db_guard()
    if guard:
        return guard

    data = request.get_json(silent=True) or {}
    email = (data.get("email") or "").strip().lower()
    password = data.get("password") or ""

    if not email or not password:
        return jsonify({"error": "email and password required"}), 400
    if not EMAIL_RE.match(email):
        return jsonify({"error": "enter a valid email address"}), 400
    if len(password) < 6:
        return jsonify({"error": "password must be at least 6 characters"}), 400

    try:
        if users_col.find_one({"email": email}):
            return jsonify({"error": "account already exists"}), 409

        pw_hash = bcrypt.generate_password_hash(password).decode("utf-8")
        user_id = str(uuid.uuid4())
        users_col.insert_one({
            "_id": user_id,
            "email": email,
            "password_hash": pw_hash,
            "role": "user",
            "created_at": datetime.datetime.utcnow(),
        })
    except DuplicateKeyError:
        return jsonify({"error": "account already exists"}), 409
    except PyMongoError as e:
        return jsonify({"error": f"database error: {e}"}), 503

    token = create_access_token(identity=user_id, additional_claims={"role": "user"})
    return jsonify({"token": token, "user_id": user_id, "role": "user"}), 201


@app.route("/api/auth/login", methods=["POST"])
def login():
    guard = db_guard()
    if guard:
        return guard

    data = request.get_json(silent=True) or {}
    email = (data.get("email") or "").strip().lower()
    password = data.get("password") or ""

    if not email or not password:
        return jsonify({"error": "email and password required"}), 400

    try:
        user = users_col.find_one({"email": email})
    except PyMongoError as e:
        return jsonify({"error": f"database error: {e}"}), 503

    if not user or not bcrypt.check_password_hash(user["password_hash"], password):
        return jsonify({"error": "invalid email or password"}), 401

    role = user.get("role", "user")
    token = create_access_token(identity=user["_id"], additional_claims={"role": role})
    return jsonify({"token": token, "user_id": user["_id"], "role": role}), 200


@app.route("/api/auth/me", methods=["GET"])
@jwt_required()
def me():
    guard = db_guard()
    if guard:
        return guard
    user_id = get_jwt_identity()
    claims = get_jwt()
    user = users_col.find_one({"_id": user_id}, {"password_hash": 0})
    if not user:
        return jsonify({"error": "not found"}), 404
    user["user_id"] = user.pop("_id")
    user["role"] = claims.get("role", user.get("role", "user"))
    return jsonify(user), 200


# ---------------------------------------------------------------------------
# Vault routes (store/retrieve encrypted blobs)
# ---------------------------------------------------------------------------
@app.route("/api/vault", methods=["POST"])
@jwt_required()
def store_item():
    guard = db_guard()
    if guard:
        return guard

    user_id = get_jwt_identity()
    data = request.get_json(silent=True) or {}

    algorithm = data.get("algorithm")
    ciphertext = data.get("ciphertext")
    iv = data.get("iv")
    filename = data.get("filename", "untitled")
    encrypted_server_side = data.get("plaintext")

    if encrypted_server_side and not ciphertext:
        passphrase = data.get("passphrase")
        if not passphrase:
            return jsonify({"error": "passphrase required for server-side encryption"}), 400
        result = encrypt_blob(encrypted_server_side, passphrase, algorithm or "AES-GCM")
        ciphertext, iv = result["ciphertext"], result["iv"]

    if not ciphertext or not algorithm:
        return jsonify({"error": "ciphertext and algorithm required"}), 400

    item_id = str(uuid.uuid4())
    try:
        vault_col.insert_one({
            "_id": item_id,
            "owner_id": user_id,
            "filename": filename,
            "algorithm": algorithm,
            "ciphertext": ciphertext,
            "iv": iv,
            "created_at": datetime.datetime.utcnow(),
        })
    except PyMongoError as e:
        return jsonify({"error": f"database error: {e}"}), 503

    return jsonify({"item_id": item_id}), 201


@app.route("/api/vault", methods=["GET"])
@jwt_required()
def list_items():
    guard = db_guard()
    if guard:
        return guard
    user_id = get_jwt_identity()
    items = list(vault_col.find({"owner_id": user_id}, {"ciphertext": 0}))
    for i in items:
        i["item_id"] = i.pop("_id")
    return jsonify(items), 200


@app.route("/api/vault/<item_id>", methods=["GET"])
@jwt_required()
def get_item(item_id):
    guard = db_guard()
    if guard:
        return guard
    user_id = get_jwt_identity()
    item = vault_col.find_one({"_id": item_id, "owner_id": user_id})
    if not item:
        return jsonify({"error": "not found"}), 404
    item["item_id"] = item.pop("_id")
    return jsonify(item), 200


@app.route("/api/vault/<item_id>", methods=["DELETE"])
@jwt_required()
def delete_item(item_id):
    guard = db_guard()
    if guard:
        return guard
    user_id = get_jwt_identity()
    result = vault_col.delete_one({"_id": item_id, "owner_id": user_id})
    if result.deleted_count == 0:
        return jsonify({"error": "not found"}), 404
    return jsonify({"status": "deleted"}), 200


# ---------------------------------------------------------------------------
# Share routes
# ---------------------------------------------------------------------------
@app.route("/api/share/<item_id>", methods=["POST"])
@jwt_required()
def create_share_link(item_id):
    guard = db_guard()
    if guard:
        return guard
    user_id = get_jwt_identity()
    item = vault_col.find_one({"_id": item_id, "owner_id": user_id})
    if not item:
        return jsonify({"error": "not found"}), 404

    data = request.get_json(silent=True) or {}
    expires_in_hours = data.get("expires_in_hours", 24)

    token = generate_share_token()
    expires_at = datetime.datetime.utcnow() + datetime.timedelta(hours=expires_in_hours)

    shares_col.insert_one({
        "_id": token,
        "item_id": item_id,
        "expires_at": expires_at,
    })

    return jsonify({"share_token": token, "expires_at": expires_at.isoformat()}), 201


@app.route("/api/share/<token>", methods=["GET"])
def resolve_share_link(token):
    guard = db_guard()
    if guard:
        return guard
    share = shares_col.find_one({"_id": token})
    if not share:
        return jsonify({"error": "invalid or expired link"}), 404
    if share["expires_at"] < datetime.datetime.utcnow():
        shares_col.delete_one({"_id": token})
        return jsonify({"error": "invalid or expired link"}), 410

    item = vault_col.find_one({"_id": share["item_id"]})
    if not item:
        return jsonify({"error": "not found"}), 404

    return jsonify({
        "filename": item["filename"],
        "algorithm": item["algorithm"],
        "ciphertext": item["ciphertext"],
        "iv": item.get("iv"),
    }), 200


# ---------------------------------------------------------------------------
# Server-side decrypt helper
# ---------------------------------------------------------------------------
@app.route("/api/decrypt", methods=["POST"])
def decrypt_route():
    data = request.get_json(silent=True) or {}
    ciphertext = data.get("ciphertext")
    iv = data.get("iv")
    passphrase = data.get("passphrase")
    algorithm = data.get("algorithm", "AES-GCM")

    if not ciphertext or not passphrase:
        return jsonify({"error": "ciphertext and passphrase required"}), 400

    try:
        plaintext = decrypt_blob(ciphertext, iv, passphrase, algorithm)
    except Exception:
        return jsonify({"error": "decryption failed — wrong passphrase or corrupted data"}), 400

    return jsonify({"plaintext": plaintext}), 200


# ---------------------------------------------------------------------------
# Admin routes
# ---------------------------------------------------------------------------
@app.route("/api/admin/stats", methods=["GET"])
@admin_required
def admin_stats():
    guard = db_guard()
    if guard:
        return guard
    total_users = users_col.count_documents({})
    total_admins = users_col.count_documents({"role": "admin"})
    total_items = vault_col.count_documents({})
    by_algorithm = {}
    for doc in vault_col.aggregate([{"$group": {"_id": "$algorithm", "count": {"$sum": 1}}}]):
        by_algorithm[doc["_id"] or "unknown"] = doc["count"]
    return jsonify({
        "total_users": total_users,
        "total_admins": total_admins,
        "total_regular_users": total_users - total_admins,
        "total_vault_items": total_items,
        "by_algorithm": by_algorithm,
    }), 200


@app.route("/api/admin/users", methods=["GET"])
@admin_required
def admin_list_users():
    guard = db_guard()
    if guard:
        return guard
    users = list(users_col.find({}, {"password_hash": 0}))
    for u in users:
        u["user_id"] = u.pop("_id")
    return jsonify(users), 200


@app.route("/api/admin/users/<user_id>", methods=["DELETE"])
@admin_required
def admin_delete_user(user_id):
    guard = db_guard()
    if guard:
        return guard
    result = users_col.delete_one({"_id": user_id})
    if result.deleted_count == 0:
        return jsonify({"error": "not found"}), 404
    vault_col.delete_many({"owner_id": user_id})
    return jsonify({"status": "deleted"}), 200


@app.route("/api/admin/vault", methods=["GET"])
@admin_required
def admin_list_all_vault_items():
    guard = db_guard()
    if guard:
        return guard
    items = list(vault_col.find({}, {"ciphertext": 0}))
    for i in items:
        i["item_id"] = i.pop("_id")
    return jsonify(items), 200


@app.route("/api/admin/vault/<item_id>", methods=["DELETE"])
@admin_required
def admin_delete_vault_item(item_id):
    guard = db_guard()
    if guard:
        return guard
    result = vault_col.delete_one({"_id": item_id})
    if result.deleted_count == 0:
        return jsonify({"error": "not found"}), 404
    return jsonify({"status": "deleted"}), 200


@app.route("/api/health", methods=["GET"])
def health():
    status_code = 200 if DB_OK else 503
    return jsonify({
        "status": "ok" if DB_OK else "degraded",
        "database": "connected" if DB_OK else f"error: {DB_ERROR}",
    }), status_code


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port, debug=False)
