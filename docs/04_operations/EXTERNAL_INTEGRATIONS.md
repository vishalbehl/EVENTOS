# EventX OS External Integrations

This document details the third-party services and external APIs integrated into the EventX OS ecosystem. These services extend the platform's capabilities in payments, communications, storage, and infrastructure.

---

## 1. Payment Gateways
The registration system supports multi-gateway payments for global ticketing operations.

| Service | Category | Integration Method | Primary Use Case |
| :--- | :--- | :--- | :--- |
| **Stripe** | Payment Gateway | `stripe` Python SDK | Global credit card processing and checkout sessions. |
| **Razorpay** | Payment Gateway | HTTP API (`httpx`) | Regional payments (primarily India) via cards, UPI, and wallets. |
| **Simulated** | Sandbox | Internal Logic | Local testing and development without live credentials. |

---

## 2. Communication Services
EventX OS uses a mix of modern APIs and legacy protocols to ensure delivery of critical notifications.

| Service | Category | Integration Method | Primary Use Case |
| :--- | :--- | :--- | :--- |
| **Resend** | Email Provider | `resend` Python SDK | High-deliverability transactional emails (Invites, Receipts). |
| **Meta Cloud API**| WhatsApp | Graph API v18.0 | Real-time attendee reminders and session updates. |
| **SMTP (Gmail)** | Email Provider | `aiosmtplib` | Fallback email delivery and custom SMTP server support. |
| **Twilio** | Communications | UI Scaffolded | Planned integration for SMS and secondary WhatsApp support. |

---

## 3. Storage Providers
A hybrid storage strategy is used to balance cloud scale with on-site offline resilience.

| Service | Category | Integration Method | Primary Use Case |
| :--- | :--- | :--- | :--- |
| **Cloudflare R2** | Object Storage | S3-Compatible API | High-volume binary data (Presentations, ePosters, Thumbnails). |
| **AWS S3** | Object Storage | S3-Compatible API | General cloud storage and backup of event exports. |
| **MinIO** | Edge Storage | S3-Compatible API | Local caching on **Venue Servers** for offline playback during events. |

---

## 4. Infrastructure & Messaging
Foundation services that power the asynchronous and real-time features of the platform.

| Service | Category | Integration Method | Primary Use Case |
| :--- | :--- | :--- | :--- |
| **Redis** | Broker / Cache | `redis-py` | Task queue for Celery workers and WebSocket session storage. |
| **PostgreSQL** | Database | `SQLAlchemy` | Primary relational data store for all tenants. |
| **Socket.io** | Real-time | `python-socketio` | Real-time UI updates (e.g., live check-in counts, file upload status). |

---

## 5. Security & Identity
- **JWT (HS256)**: Internal identity management via signed JSON Web Tokens.
- **Bcrypt**: Industrial-standard password hashing.
- **AES-256 (Fernet)**: Used to encrypt sensitive third-party credentials (Stripe/Razorpay keys) before storing them in the database.

---

## 6. Observations & Future Integrations
- **AI Services**: Folder structure and icons suggest planned integrations with **OpenAI** or **Anthropic** for content summarization and chat, though no direct API implementation was found in the current backend.
- **OAuth Providers**: Currently, the platform relies on Email/Password and OTP authentication. Social logins (Google/Microsoft) are not yet natively implemented.
- **Analytics**: System analytics are currently handled internally through database tracking. External tools like **PostHog** or **Mixpanel** are not currently active in the core API.
