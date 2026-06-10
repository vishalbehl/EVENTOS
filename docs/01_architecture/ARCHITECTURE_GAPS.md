# EventX OS Architecture Gaps Analysis

Following a comprehensive audit and documentation of the EventX OS repository, this report identifies critical gaps, technical risks, and ambiguous business rules that require human clarification or further engineering investigation.

---

## 1. Missing Technical Information
*The following items are not fully defined within the codebase and cannot be safely inferred.*

- **Secrets Management Strategy**: While the code uses AES-256 (Fernet) to encrypt gateway keys in the database, the location of the master `PAYMENT_SECRET_KEY` and `JWT_SECRET_KEY` is currently limited to `.env` files. Is there a planned integration with a secret manager (e.g., AWS Secrets Manager, HashiCorp Vault)?
- **CI/CD & Deployment Orchestration**: No pipeline definitions (GitHub Actions, GitLab CI) or Infrastructure-as-Code (Terraform/Ansible) were found. The process for provisioning and updating localized **Venue Servers** at physical event sites remains undefined.
- **Production Monitoring**: There is no evidence of an integrated APM (Application Performance Monitoring) or error tracking suite (e.g., Sentry, Datadog, Prometheus).
- **Blob Storage Policies**: The repository assumes S3-compatible storage. It is unclear if buckets are configured with Object Lock (for audit logs) or if Lifecycle Policies are in place to purge temporary imports.

---

## 2. Ambiguous Business Rules
*These logic areas require clarification from stakeholders to ensure correct implementation.*

- **Sync Conflict Resolution**: In the hybrid cloud/edge model, if a participant's profile is edited in the Cloud and they are simultaneously checked-in at the Venue, how is the "Source of Truth" determined? Current code suggests a "Cloud Wins" configuration bias, which may cause data loss for on-site activities.
- **Refund Orchestration**: The `PAYMENTS:REFUND` permission exists, but the backend implementation for automated gateway refunds (Stripe/Razorpay) is minimal. Is the policy to handle refunds manually through the gateway's own dashboard?
- **Overselling & Capacity**: `REGISTRATION:OVERRIDE` allows staff to bypass session limits. What is the business impact on badge printing and session room fire-safety limits?

---

## 3. Partially Implemented Features
*The following components exist as scaffolds or configuration stubs but lack functional logic.*

- **AI Services**: Folder structures for AI-assisted content analysis are present, but no direct integration with LLM providers (OpenAI/Anthropic) was found.
- **Interactive Venue Apps**: The `eposter-display`, `signage-app`, and `moderator-app` are currently Electron or Next.js scaffolds with placeholder UIs.
- **WhatsApp Integration**: Configuration keys for the Meta Cloud API exist, but the notification service logic for WhatsApp templates is not yet fully realized.
- **Organization Onboarding**: The `SignupWizard` exists in the UI, but the backend workflow for automatic multi-tenant database provisioning (Alembic per-schema or per-DB) is not fully traced.

---

## 4. Security Assumptions for Manual Verification
*The following security measures are implemented but should be rigorously tested.*

- **RLS Completeness**: Row-Level Security is enabled via migrations, but it must be manually verified that **every** new table in the `rbac`, `speakers`, and `registration` schemas includes the mandatory `organization_id` check.
- **Refresh Token Family Race Conditions**: The token rotation logic invalidates the entire "family" on reuse. This must be tested under high-latency network conditions to ensure legitimate users aren't locked out due to duplicate requests.
- **S3 Presigned URL Scope**: Verify that `S3_PRESIGNED_EXPIRY_SECONDS` (default 3600) is appropriate for speaker downloads in low-bandwidth venue environments.

---

## 5. Defense-in-Depth Questions
*Questions to address before finalized production hardening:*

1.  **Network Isolation**: Will Venue Servers communicate with the Cloud via a public endpoint, or is a site-to-site VPN/Tailscale mesh required?
2.  **Audit Log Immutability**: Are `audit_logs` and `security_events` mirrored to a separate, write-only logging server to prevent tampering by a compromised admin account?
3.  **WAF Configuration**: Is there a Web Application Firewall (WAF) strategy to protect the `registration-portal` from automated "scalping" bots?
4.  **Hardware Trust**: How is the identity of a physical "SRR Scanner" verified before it is allowed to push data to the `SyncOutbox`?
