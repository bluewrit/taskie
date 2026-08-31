"""Password hashing + token helpers (stdlib only)."""
import hashlib
import secrets
from datetime import datetime, timedelta

PBKDF2_ROUNDS = 120_000


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    dk = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, PBKDF2_ROUNDS)
    return f"{salt.hex()}${dk.hex()}"


def verify_password(password: str, stored: str) -> bool:
    try:
        salt_hex, hash_hex = stored.split("$", 1)
        salt = bytes.fromhex(salt_hex)
    except (ValueError, AttributeError):
        return False
    dk = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, PBKDF2_ROUNDS)
    return secrets.compare_digest(dk.hex(), hash_hex)


def make_token() -> str:
    return secrets.token_urlsafe(32)


def token_expiry() -> datetime:
    return datetime.utcnow() + timedelta(days=30)
