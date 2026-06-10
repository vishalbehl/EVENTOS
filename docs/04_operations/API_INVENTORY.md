# EventX OS API Inventory

This document provides a comprehensive list of all API endpoints across the EventX OS ecosystem, grouped by service and category.

---

## 1. Platform API (Cloud Backend)
The central API orchestrator for all cloud-based operations.

### Domain: Authentication & Identity
| Method | Path | Purpose | Auth Required | Input Model | Output Model | Tables Touched |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| POST | `/auth/login` | Organizer/Admin Login | Public | `LoginRequest` | `TokenResponse` | `users`, `refresh_tokens` |
| POST | `/auth/refresh` | Rotate JWT tokens | Public | `RefreshRequest` | `TokenResponse` | `refresh_tokens`, `users` |
| GET | `/auth/me` | Current profile | JWT (User) | - | `UserMeResponse` | `users` |
| POST | `/auth/logout` | Revoke sessions | JWT (User) | - | `MessageResponse` | `refresh_tokens` |

### Domain: Public Registration Portal
| Method | Path | Purpose | Auth Required | Input Model | Output Model | Tables Touched |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| GET | `/portal/registration/{id}/form` | Get event config | Public | - | `FormConfigJSON` | `events`, `registration_form_configs` |
| POST | `/portal/registration/{id}/register`| Submit registration | Public | `RegistrationData` | `RegistrationResult` | `participant_registrations`, `capacity_rules` |
| POST | `/portal/registration/{id}/promo/validate` | Check promo code | Public | `PromoValidateRequest`| `PromoResult` | `promo_codes`, `ticket_types` |
| POST | `/portal/registration/{id}/payment/checkout` | Start payment | Public | `CheckoutRequest` | `PaymentDetails` | `participant_registrations`, `payment_transactions` |
| POST | `/portal/registration/{id}/payment/verify` | Finalize payment | Public | `PaymentVerifyRequest`| `VerifyResult` | `payment_transactions`, `participants` |

### Domain: Organizer Management (Admin)
| Method | Path | Purpose | Auth Required | Input Model | Output Model | Tables Touched |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| GET | `/events` | List all events | JWT (Admin) | - | `List[Event]` | `events` |
| POST | `/events` | Create new event | JWT (Admin) | `EventCreate` | `Event` | `events`, `audit_logs` |
| GET | `/registrations/{event_id}` | View all registrations| JWT (Staff) | - | `List[Registration]` | `participant_registrations` |
| POST | `/registrations/{id}/approve` | Approve registration | JWT (Admin) | - | `MessageResponse` | `participants`, `participant_registrations` |
| GET | `/speakers/{event_id}` | List event speakers | JWT (Staff) | - | `List[Speaker]` | `speakers` |

### Domain: Venue Synchronization (Internal)
| Method | Path | Purpose | Auth Required | Input Model | Output Model | Tables Touched |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| GET | `/sync/events/{id}/queue` | Pull venue config | Internal Key | - | `SyncPayload` | `sessions`, `participants`, `badges`, `rules` |
| POST | `/sync/events/{id}/push` | Push on-site logs | Internal Key | `List[PushItem]` | `SyncResult` | `attendance_logs`, `badge_scans`, `badge_print_jobs` |

---

## 2. Venue Server (Edge Node)
Localized services running at the event site for hardware interaction and offline resilience.

### Domain: Presentation & Snapshot (Device)
| Method | Path | Purpose | Auth Required | Input Model | Output Model | Tables Touched |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| GET | `/api/v1/sessions/{id}/snapshot` | Get execution state | Device Token | - | `SessionSnapshot` | `sessions`, `session_speakers`, `presentation_files` |
| POST | `/api/v1/sessions/{id}/lock` | Freeze for room | Device Token | - | `StatusResponse` | `sessions` |

### Domain: Local Operations (On-Site Staff)
| Method | Path | Purpose | Auth Required | Input Model | Output Model | Tables Touched |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| GET | `/api/local/participants/search` | Local check-in search | Local Auth | `query` | `List[Participant]` | `local_participants` (SQLite/Postgres) |
| POST | `/api/local/badges/{id}/print` | Trigger local print | Local Auth | - | `PrintJob` | `local_badge_print_jobs` |
| POST | `/api/local/checkin/{id}` | Mark local attendance| Local Auth | - | `AttendanceLog` | `local_attendance_logs`, `local_participants` |

---

## 3. Endpoint Categorization

### Public Endpoints
*Accessible without credentials, often protected by CSRF or Rate Limiting.*
- All `/auth/login` and `/auth/refresh` endpoints.
- Registration Portal form retrieval and submission.
- Payment checkout and verification webhooks.
- Speaker portal material upload (authenticated via single-use `upload_token`).

### Internal Endpoints
*Used for service-to-service communication. Protected by `X-Internal-Secret`.*
- Cloud Sync pull/push endpoints.
- Celery worker status and heartbeats.

### Admin Endpoints
*High-privileged access for organizers and system admins. Protected by RBAC + JWT.*
- Organization and User management.
- Event configuration and license management.
- Participant PII access and bulk export.
- System-wide analytics and financial reports.

### Device Endpoints
*Restricted to authorized hardware (Kiosks, Room Displays, Handhelds). Protected by Device Keys/Tokens.*
- Snapshot API for Room Displays.
- Device Heartbeat and Telemetry ingestors.
- On-site Badge Printing triggers.

---

## 4. Input/Output Model Patterns
- **Serialization**: Most endpoints use **Pydantic v2** models for strict validation.
- **Envelope**: Success responses typically return the object directly or wrapped in a `MessageResponse`.
- **Errors**: Follow RFC 7807 (Problem Details for HTTP APIs) using FastAPI's `HTTPException` class.
