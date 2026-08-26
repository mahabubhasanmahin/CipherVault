"""
CipherVault - Server-side crypto helpers.

Client-side encryption (Web Crypto API in the browser) is preferred so
plaintext never leaves the user's machine. These helpers exist for:
  - the optional server-side encryption path (e.g. plain textarea input
    without JS crypto available)
  - the /api/decrypt convenience endpoint

Algorithms supported here: AES-256-GCM, ChaCha20-Poly1305.
(RSA is handled client-side only, since it's key-pair based rather than
passphrase based — see frontend/js/webcrypto.js)
"""
import os
import base64
import hashlib
import secrets

from cryptography.hazmat.primitives.ciphers.aead import AESGCM, ChaCha20Poly1305
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
from cryptography.hazmat.primitives import hashes

PBKDF2_ITERATIONS = 200_000
SALT_SIZE = 16
NONCE_SIZE = 12


def _derive_key(passphrase: str, salt: bytes) -> bytes:
    """Derive a 256-bit key from a passphrase using PBKDF2-HMAC-SHA256."""
    kdf = PBKDF2HMAC(
        algorithm=hashes.SHA256(),
        length=32,
        salt=salt,
        iterations=PBKDF2_ITERATIONS,
    )
    return kdf.derive(passphrase.encode("utf-8"))


def encrypt_blob(plaintext: str, passphrase: str, algorithm: str = "AES-GCM") -> dict:
    """
    Encrypts plaintext with a passphrase-derived key.
    Returns base64 ciphertext (salt + nonce + ciphertext packed together)
    and the nonce separately for compatibility with the API shape.
    """
    salt = os.urandom(SALT_SIZE)
    nonce = os.urandom(NONCE_SIZE)
    key = _derive_key(passphrase, salt)

    if algorithm == "ChaCha20":
        aead = ChaCha20Poly1305(key)
    else:  # default AES-GCM
        aead = AESGCM(key)

    ct = aead.encrypt(nonce, plaintext.encode("utf-8"), None)

    # pack salt + nonce + ciphertext so decrypt only needs the passphrase
    packed = salt + nonce + ct
    return {
        "ciphertext": base64.b64encode(packed).decode("utf-8"),
        "iv": base64.b64encode(nonce).decode("utf-8"),
    }


def decrypt_blob(ciphertext_b64: str, iv_b64: str, passphrase: str, algorithm: str = "AES-GCM") -> str:
    """Reverses encrypt_blob. Raises on wrong passphrase / tampered data."""
    packed = base64.b64decode(ciphertext_b64)
    salt = packed[:SALT_SIZE]
    nonce = packed[SALT_SIZE:SALT_SIZE + NONCE_SIZE]
    ct = packed[SALT_SIZE + NONCE_SIZE:]

    key = _derive_key(passphrase, salt)

    if algorithm == "ChaCha20":
        aead = ChaCha20Poly1305(key)
    else:
        aead = AESGCM(key)

    plaintext = aead.decrypt(nonce, ct, None)
    return plaintext.decode("utf-8")


def generate_share_token() -> str:
    """URL-safe random token for shareable links."""
    return secrets.token_urlsafe(24)


def sha256_hex(data: str) -> str:
    """Utility: hash a string for integrity checks / fingerprints."""
    return hashlib.sha256(data.encode("utf-8")).hexdigest()
