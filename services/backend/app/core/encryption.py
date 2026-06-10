from typing import Optional
from cryptography.fernet import Fernet, InvalidToken
from app.config import settings

_VERSION = "v1"
_PREFIX = f"{_VERSION}:"

_fernet_instance: Optional[Fernet] = None
_loaded_key: Optional[str] = None

def _get_fernet() -> Fernet:
    global _fernet_instance, _loaded_key
    key = settings.FERNET_KEY
    if not key:
        raise RuntimeError("FERNET_KEY settings is not configured.")
    if _fernet_instance is None or _loaded_key != key:
        _fernet_instance = Fernet(key.encode())
        _loaded_key = key
    return _fernet_instance

def encrypt(plaintext: str) -> str:
    """
    Encrypt plaintext using Fernet (AES-128-CBC + HMAC-SHA256).
    Returns versioned token "v1:<base64>".
    """
    if not plaintext:
        return ""
    token = _get_fernet().encrypt(plaintext.encode()).decode()
    return f"{_PREFIX}{token}"

def decrypt(ciphertext: str) -> str:
    """
    Decrypt a versioned token produced by encrypt().
    Handles "v1:" prefix versioning.
    """
    if not ciphertext:
        return ""
    if not ciphertext.startswith(_PREFIX):
        raise ValueError(
            f"Unsupported cipher token format. "
            f"Expected prefix '{_PREFIX}', got: '{ciphertext[:8]}...'"
        )
    raw_token = ciphertext[len(_PREFIX):]
    try:
        return _get_fernet().decrypt(raw_token.encode()).decode()
    except InvalidToken as exc:
        raise ValueError("Cipher token is invalid or has been tampered with.") from exc
