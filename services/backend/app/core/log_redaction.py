"""Strip credential-bearing fields before building diagnostic or audit records."""
import re

_SENSITIVE = re.compile(r"password|passwd|secret|token|cookie|authorization|credential|private.?key|api.?key|mfa.?code|recovery.?code|invitation.?link", re.I)


def redact_credentials(value):
    if isinstance(value, dict):
        return {key: "[REDACTED]" if _SENSITIVE.search(str(key)) else redact_credentials(item)
                for key, item in value.items()}
    if isinstance(value, list):
        return [redact_credentials(item) for item in value]
    return value
