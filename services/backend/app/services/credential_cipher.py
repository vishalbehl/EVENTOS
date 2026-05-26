import logging
from typing import Optional

from cryptography.fernet import Fernet, InvalidToken

logger = logging.getLogger(__name__)

_VERSION = "v1"
_PREFIX = f"{_VERSION}:"


class CredentialCipher:
    """
    Encrypts/decrypts individual string values using Fernet (AES-128-CBC +
    HMAC-SHA256).  Although the library uses AES-128 internally, the 32-byte
    key provides 256 bits of entropy — commonly referred to as AES-256 Fernet.

    Usage
    -----
    from app.services.credential_cipher import cipher

    encrypted = cipher.encrypt("sk_live_abc123")
    plain     = cipher.decrypt(encrypted)
    masked    = cipher.mask(encrypted)   # "••••••••3456" — safe for HTTP GET
    """

    def __init__(self) -> None:
        self._fernet_instance: Optional[Fernet] = None
        self._loaded_key: Optional[str] = None

    def _get_fernet(self) -> Fernet:
        """
        Lazy-init the Fernet instance from settings.PAYMENT_SECRET_KEY.
        Re-initialises if the key changes (useful in tests).
        """
        from app.config import settings  # noqa: PLC0415

        current_key = settings.PAYMENT_SECRET_KEY
        if not current_key:
            raise RuntimeError(
                "PAYMENT_SECRET_KEY is not configured. "
                "Generate one with: "
                "python -c \"from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())\" "
                "and add it to your .env file."
            )
        # Re-create if key has changed (e.g. rotated in tests)
        if self._fernet_instance is None or self._loaded_key != current_key:
            self._fernet_instance = Fernet(current_key.encode())
            self._loaded_key = current_key
        return self._fernet_instance

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def encrypt(self, plaintext: str) -> str:
        """
        Encrypt *plaintext* and return a versioned token ``"v1:<fernet_token>"``.
        Returns ``""`` immediately if *plaintext* is empty or falsy.
        """
        if not plaintext:
            return ""

        token = self._get_fernet().encrypt(plaintext.encode()).decode()
        return f"{_PREFIX}{token}"

    def decrypt(self, token: str) -> str:
        """
        Decrypt a versioned token produced by :meth:`encrypt`.
        Returns ``""`` immediately if *token* is empty or falsy.

        Raises
        ------
        RuntimeError
            If ``PAYMENT_SECRET_KEY`` is not set.
        ValueError
            If the token has an unknown version prefix or is corrupt / tampered.
        """
        if not token:
            return ""

        if not token.startswith(_PREFIX):
            # Could be an un-versioned legacy value or corruption.
            raise ValueError(
                f"Unsupported credential token format. "
                f"Expected prefix '{_PREFIX}', got: '{token[:8]}...'"
            )

        raw_token = token[len(_PREFIX):]

        try:
            return self._get_fernet().decrypt(raw_token.encode()).decode()
        except InvalidToken as exc:
            raise ValueError(
                "Payment credential token is invalid or has been tampered with."
            ) from exc

    def mask(self, token: str) -> str:
        """
        Decrypt *token* and return a masked string suitable for HTTP responses::

            "••••••••3456"

        The last 4 characters of the plaintext are revealed so the organizer
        can confirm which key is configured without exposing the full secret.
        Returns ``""`` if *token* is empty.
        """
        if not token:
            return ""

        plaintext = self.decrypt(token)
        if not plaintext:
            return ""

        suffix = plaintext[-4:] if len(plaintext) >= 4 else plaintext
        return f"••••••••{suffix}"

    def is_encrypted(self, value: str) -> bool:
        """Return True if *value* looks like a versioned cipher token."""
        return bool(value) and value.startswith(_PREFIX)


# ---------------------------------------------------------------------------
# Module-level singleton — import this everywhere:
#   from app.services.credential_cipher import cipher
# ---------------------------------------------------------------------------
cipher = CredentialCipher()
