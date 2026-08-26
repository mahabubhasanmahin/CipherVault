"""
CipherVault - MongoDB document shapes (reference only).

app.py talks to MongoDB directly via pymongo, so these are not ORM
classes — just the field contracts each collection follows, kept here
for onboarding / documentation purposes.

users collection:
    _id             str (uuid4)
    email           str, lowercase, unique
    password_hash   str (bcrypt)
    created_at      datetime

Fields intentionally NOT stored: plaintext passwords, encryption
passphrases, or any decrypted vault content.
"""

USER_SCHEMA_EXAMPLE = {
    "_id": "uuid4-string",
    "email": "user@example.com",
    "password_hash": "$2b$...",
    "created_at": "ISODate",
}
