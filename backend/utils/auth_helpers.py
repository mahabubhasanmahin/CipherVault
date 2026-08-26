"""
CipherVault - auth helper decorators.
"""
from functools import wraps
from flask import jsonify
from flask_jwt_extended import verify_jwt_in_request, get_jwt


def admin_required(fn):
    """Require a valid JWT whose claims include role == 'admin'."""
    @wraps(fn)
    def wrapper(*args, **kwargs):
        verify_jwt_in_request()
        claims = get_jwt()
        if claims.get("role") != "admin":
            return jsonify({"error": "admin access required"}), 403
        return fn(*args, **kwargs)
    return wrapper
