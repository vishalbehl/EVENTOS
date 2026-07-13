# Historical Credential Negative Test

Do not paste the tested credential into this document or command output.

| Field | Value |
|---|---|
| Evidence ID | `NEG-YYYY-NNN` |
| Related rotation evidence | |
| Credential fingerprint/key ID | |
| Environment | |
| Test endpoint/operation | |
| Test timestamp (UTC) | |
| Operator | |
| Expected denial | |
| Actual status/error code | |
| Raw redacted output path | |
| Reviewer | |
| Result | `PENDING` |

## Safe Test Method

Describe how the old credential was supplied from an ephemeral local variable
or approved secret store. Commands captured as evidence must redact headers and
must not enable verbose HTTP tracing that prints tokens.

## Acceptance

The old credential fails closed, the denial is audited where applicable, and
the new credential continues to work. A timeout or provider outage is not
proof of revocation.

