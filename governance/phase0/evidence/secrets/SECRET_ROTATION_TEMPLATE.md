# Secret Rotation Evidence

Copy this file once per credential. Do not include the secret value.

| Field | Value |
|---|---|
| Evidence ID | `ROT-YYYY-NNN` |
| Secret/key name | |
| Environment | |
| Owning system/provider | |
| Responsible owner | |
| Rotation performed by | |
| Rotation timestamp (UTC) | |
| New key ID/fingerprint | |
| Old key ID/fingerprint | |
| Secret-manager/provider reference | |
| Deployment/restart reference | |
| Revocation timestamp (UTC) | |
| Negative-auth evidence path | |
| Log/telemetry exposure check | |
| Reviewer and review date | |
| Status | `PENDING` |

## Rotation Procedure

Describe creation, deployment, verification, and revocation without recording
the credential itself.

## Revocation Proof

Attach a redacted provider audit event, secret-manager version record, or
administrative log proving the old key was disabled or deleted.

## Validation

- New credential succeeds for its intended operation.
- Old credential fails authentication or authorization.
- Old encryption key cannot decrypt newly protected data and is handled under
  the approved key-retirement/data-migration procedure.
- Logs, traces, browser bundles, reports, and evidence files contain no raw key.

## Approval

Record owner and reviewer decisions, residual risk, and any required follow-up.

