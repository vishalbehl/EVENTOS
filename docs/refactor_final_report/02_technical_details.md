# 02_technical_details.md: Technical Refactor Audit

## Database Refactoring
The core of this transformation involved restructuring the PostgreSQL physical storage layer to match logical domain boundaries.

### Schema Migration Table
| Table | Legacy Schema | Target Schema | Status |
| :--- | :--- | :--- | :--- |
| `audit_logs` | `public` | `audit.logs` | Migrated |
| `api_request_logs` | `public` | `audit.api_logs` | Migrated |
| `worker_job_logs` | `public` | `audit.worker_logs` | Migrated |
| `impersonation_logs`| `billing` | `audit.impersonation_logs` | Migrated |
| `support_tickets` | `billing` | `support.support_tickets` | Migrated |
| `ticket_comments` | `billing` | `support.ticket_comments` | Migrated |
| `speakers` | `events` | `speakers.speakers` | Migrated |
| `speaker_profiles` | `events` | `speakers.profiles` | Migrated |
| `session_speakers` | `events` | `speakers.session_assignments`| Migrated |
| `speaker_theme_settings` | `speakers` | `events` | Reverted as requested |

### Tenant Isolation Audit
Every table was audited for tenant lineage (`organization_id` or `event_id`).
- Tables missing direct keys were assigned them via foreign key inheritance paths.
- Repository layer was updated to use `BaseRepository` with mandatory tenant scoping filters.

### UUID Standardization
- Converted primary keys (e.g., `ticket_types.id`) from Integer to UUID to ensure compatibility with global enterprise SaaS requirements and distributed systems.

### Security Enhancements
- **CredentialCipher:** Re-used and expanded the `Cipher` service based on `cryptography.fernet`.
- **User Model:** Modified `two_factor_secret` to use `hybrid_property` for automatic encryption/decryption in the ORM layer.
- **Migration:** All legacy plaintext credentials in `identity.users` and `registration_theme_settings` (Stripe secrets) were encrypted.

### Soft Delete Framework
- **Mixin:** Created `SoftDeleteMixin` in `app/services/mixins/soft_delete.py`.
- **Implementation:** Added `deleted_at`, `deleted_by` to:
    - Events (all relevant models)
    - Speakers (all models)
    - Registration (Participants, Registrations)
    - Presentations (File records)
    - Identity (Users)

## Circular Dependencies & Fixes
- Addressed numerous `ImportError` scenarios stemming from `app/models/__init__.py` and circular dependencies between `Identity` and `Events` models by:
    - Refactoring `Base` and `Mixins` to avoid circular references.
    - Explicitly defining `foreign_keys` arguments in SQLAlchemy `relationship` definitions to resolve ambiguity.
    - Updating automated migration wrapper scripts to ensure all models are imported before Alembic inspection.

---
*Status: Refactor Audit Complete*
