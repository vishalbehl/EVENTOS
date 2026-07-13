# Secret and Key Register

Status: SEEDED FROM CONFIG, ROTATION PROOF REQUIRED

Snapshot:

- Date: 2026-07-11
- Evidence source: `services/backend/app/config.py`, `services/workers/config.py`, `services/venue-server/app/config.py`, cloud app references

| Secret/key | Environment | Owner | Storage location | Rotation status | Last rotated | Validation evidence | Notes |
|---|---|---|---|---|---|---|---|
| `JWT_SECRET_KEY` | Production | Engineering | Secret manager/env | Required | Unknown | Pending | Backend production validator rejects default/short values |
| `FERNET_KEY` | Production | Engineering | Secret manager/env | Required | Unknown | Pending | Required for encrypted credential material |
| `PAYMENT_SECRET_KEY` | Production | Engineering | Secret manager/env | Required | Unknown | Pending | Payment signing/verification material |
| `PORTAL_JWT_SECRET` | Production | Engineering | Secret manager/env | Required | Unknown | Pending | Separate attendee/self-service token secret |
| `CLOUD_API_KEY` | Production | Engineering | Secret manager/env | Required | Unknown | Pending | Backend validator rejects default; venue config still has dev default |
| `S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY` | Production | Engineering | Secret manager/env | Required | Unknown | Pending | Backend/worker object storage access |
| `RESEND_API_KEY` | Production | Product/Risk + Engineering | Secret manager/env | Required if used | Unknown | Pending | Email provider key |
| SMTP credentials | Production | Product/Risk + Engineering | Secret manager/env | Required if used | Unknown | Pending | SMTP fallback/provider |
| `WHATSAPP_ACCESS_TOKEN` | Production | Product/Risk + Engineering | Secret manager/env | Required if used | Unknown | Pending | Meta/WhatsApp messaging token |
| AI provider key such as `GEMINI_API_KEY` | Production | Product/Risk + Engineering | Secret manager/env | Required if used | Unknown | Pending | AI/embedding/generation calls |
| Venue device keys | Production | Engineering | Hashed DB value/device config | Lifecycle implemented, proof pending | Unknown | Pending | Requires expiry, rotation, and revocation evidence |
| MinIO/local storage secret | Venue/local | Engineering | Local venue config/secret store | Required before venue production | Unknown | Pending | Venue config currently contains `minioadmin` default |

## Config Evidence

- Backend production validation rejects default `JWT_SECRET_KEY`, default `CLOUD_API_KEY`, missing `FERNET_KEY`, short/missing `PORTAL_JWT_SECRET`, and long access-token lifetime.
- Static scan found development defaults in venue server config: `dev_internal_secret_do_not_use_in_prod` and `minioadmin`.
- Local `.env` files exist in the repository tree and must be reviewed before sharing, committing, or packaging evidence.

## Closure Requirement

For every historically exposed or potentially exposed secret:

- rotate the secret;
- revoke the old credential;
- prove old credential no longer authenticates or decrypts active protected data;
- record the evidence path;
- verify logs, traces, browser bundles, and exported reports do not contain raw secret values.

Use `evidence/secrets/SECRET_ROTATION_TEMPLATE.md` for each rotation and
`evidence/secrets/NEGATIVE_AUTH_TEST_TEMPLATE.md` for revocation validation.
Provider screenshots belong in `evidence/screenshots/` after redaction. The
register must reference evidence IDs and paths; it must never contain raw key
material.
