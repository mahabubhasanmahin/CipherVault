"""
CipherVault - MongoDB document shapes (reference only).

vault_items collection:
    _id             str (uuid4)          -- item_id
    owner_id        str (uuid4)          -- references users._id
    filename        str
    algorithm       str                  -- "AES-GCM" | "RSA-OAEP" | "ChaCha20"
    ciphertext      str (base64)         -- salt+nonce+ciphertext packed, or RSA ct
    iv              str (base64) | None  -- nonce, None for RSA-OAEP
    created_at      datetime

share_links collection:
    _id             str                  -- the share token itself (URL-safe)
    item_id         str (uuid4)          -- references vault_items._id
    expires_at      datetime

Nothing here ever stores plaintext or a passphrase — only ciphertext
and metadata needed to locate/expire it.
"""

VAULT_ITEM_SCHEMA_EXAMPLE = {
    "_id": "uuid4-string",
    "owner_id": "uuid4-string",
    "filename": "notes.txt",
    "algorithm": "AES-GCM",
    "ciphertext": "base64...",
    "iv": "base64...",
    "created_at": "ISODate",
}

SHARE_LINK_SCHEMA_EXAMPLE = {
    "_id": "url-safe-token",
    "item_id": "uuid4-string",
    "expires_at": "ISODate",
}
