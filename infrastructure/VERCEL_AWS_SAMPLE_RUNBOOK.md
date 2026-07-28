# Vercel Frontend and AWS Backend Runbook

Status: repository implementation complete; live account provisioning requires
the external values and approvals listed below.

## Boundary

- Vercel hosts only the four Next.js portals.
- AWS hosts FastAPI, WebSockets, PostgreSQL, Redis, Celery, schedules, and S3.
- Browsers never receive database, Redis, AWS, Resend, Meta, or payment secrets.
- PostgreSQL is authoritative. Redis is disposable infrastructure.
- S3 is private and accessed through tenant-authorized presigned requests.

## Required external setup

1. Create or select the isolated AWS sample account and `ap-south-1` region.
2. Create the Terraform state bucket and DynamoDB lock table before the first workflow run.
3. Create a GitHub OIDC deployment role scoped to the sample account.
4. Request and validate the ACM certificate for the sample API hostname.
5. Create four Vercel projects with these roots:
   - `apps/cloud/command-center`
   - `apps/cloud/organiser-portal`
   - `apps/cloud/registration-portal`
   - `apps/cloud/speaker-portal`
6. Set Vercel production variables for every project:
   - `NEXT_PUBLIC_API_URL=https://api.sample.example.com`
   - `NEXT_PUBLIC_WS_URL=https://api.sample.example.com`
7. Create DNS records for the four Vercel projects and the AWS ALB.
8. Verify the Resend domain and webhook before enabling delivery.

## GitHub environment configuration

Create a protected GitHub environment named `sample`.

Repository/environment variables:

```text
AWS_REGION=ap-south-1
AWS_DEPLOY_ROLE_ARN=arn:aws:iam::<account>:role/<github-deploy-role>
AWS_TF_STATE_BUCKET=<state-bucket>
AWS_TF_LOCK_TABLE=<lock-table>
OPERATIONS_ALERT_EMAIL=<confirmed-alert-address>
SAMPLE_MONTHLY_BUDGET_USD=50
SAMPLE_API_DOMAIN=api.sample.example.com
SAMPLE_API_CERTIFICATE_ARN=<validated-acm-certificate-arn>
SAMPLE_SPEAKER_URL=https://speaker.sample.example.com
SAMPLE_PORTAL_ORIGINS_TF=["https://command.sample.example.com","https://organiser.sample.example.com","https://register.sample.example.com","https://speaker.sample.example.com"]
```

Secrets:

```text
VERCEL_TOKEN
VERCEL_ORG_ID
VERCEL_COMMAND_CENTER_PROJECT_ID
VERCEL_ORGANISER_PROJECT_ID
VERCEL_REGISTRATION_PROJECT_ID
VERCEL_SPEAKER_PROJECT_ID
RUNTIME_SECRET_JSON
DEPLOYMENT_SECRET_JSON
IDENTITY_BOOTSTRAP_SECRET_JSON
```

`RUNTIME_SECRET_JSON` initially contains application secrets only. The database
bootstrap task merges generated least-privilege database URLs into this secret.

```json
{
  "JWT_SECRET_KEY": "generated-rotated-value",
  "PROPOSAL_SHARE_SECRET": "generated-independent-value",
  "CLOUD_API_KEY": "generated-machine-secret",
  "FERNET_KEY": "generated-fernet-key",
  "PORTAL_JWT_SECRET": "generated-independent-value",
  "PAYMENT_SECRET_KEY": "generated-fernet-key",
  "BACKEND_INTERNAL_API_KEY": "generated-independent-value",
  "RESEND_API_KEY": "",
  "WHATSAPP_ACCESS_TOKEN": ""
}
```

`DEPLOYMENT_SECRET_JSON` contains only independently generated database login
passwords. It is mounted only into one-off bootstrap/migration tasks.

```json
{
  "RUNTIME_DB_PASSWORD": "generated-value",
  "MIGRATION_DB_PASSWORD": "different-generated-value"
}
```

Never commit either JSON object. Rotate values through GitHub and AWS Secrets
Manager, then force a new ECS deployment.

For the first deployment only, set `IDENTITY_BOOTSTRAP_SECRET_JSON`:

```json
{
  "BOOTSTRAP_SUPERADMIN_EMAIL": "security-admin@example.com",
  "BOOTSTRAP_SUPERADMIN_PASSWORD": "generated-one-time-password"
}
```

Run the AWS workflow once with `run_identity_bootstrap=true`. The one-off task
creates the account with TOTP already active and replaces the secret value with
an `MFA_ENROLLMENT_URI`; it does not print the URI or password to logs. Retrieve
the URI through authorized Secrets Manager access, enroll it, verify login, and
delete the AWS bootstrap secret and the protected GitHub
`IDENTITY_BOOTSTRAP_SECRET_JSON` secret. Never rerun the task for an existing
identity. Record deletion and successful MFA login as deployment evidence.

## Deployment sequence

1. Run `Terraform quality` and resolve every formatting or validation failure.
2. Run `Deploy AWS sample backend` with `infrastructure_only=true`.
3. Confirm AWS budget email and SNS subscription.
4. Add the runtime/deployment JSON secrets to the protected GitHub environment.
5. Run `Deploy AWS sample backend` with database bootstrap enabled.
6. The workflow builds immutable images, applies infrastructure at zero tasks,
   provisions database logins, runs Alembic, refreshes grants, starts services,
   and verifies `/ready`.
7. Point the API DNS record at the Terraform ALB output.
8. On the first deployment only, run the protected identity bootstrap and enroll MFA.
9. Run `Deploy Vercel portals`.
10. Add each custom Vercel domain and complete DNS verification.
11. Run cross-tenant, WebSocket, upload, worker, and entitlement smoke tests.
12. Keep `public_demo_signup_enabled=false` until email verification, CAPTCHA,
    rate limits, expiry cleanup, and provider kill switches have passed evidence.

## Database roles

- RDS manages the master credential; it is used only by the bootstrap task.
- `Event_migration_login` owns migration execution and inherits the migration group.
- `Event_runtime_login` is non-superuser, cannot bypass RLS, and is used by API/workers.
- API and worker tasks never receive the RDS master or deployment secret.
- The bootstrap task is run before and after Alembic so new schemas receive runtime grants.

## Celery topology

The single sample worker ECS task contains three processes:

- Domain worker: backend `app.*` tasks on the `celery` queue.
- Processing worker: `workers.tasks.*` on `default`, `files`, `videos`, `imports`, and `search`.
- Scheduler: the backend Celery Beat schedule.

Keep the worker ECS service at one task while Beat is colocated. Before worker
horizontal scaling, move Beat to a singleton service or EventBridge Scheduler.

## Go-live evidence

- ALB `/ready` reports PostgreSQL and Redis healthy.
- Alembic reports one expected head.
- Runtime role startup RLS check passes.
- Organization A cannot access Organization B records or S3 keys.
- Presigned URLs expire and cannot escape the tenant prefix.
- Worker restart does not duplicate durable jobs or communications.
- Old credentials are revoked and no tracked file contains active secrets.
- AWS and Vercel budgets, alerts, rollback, and backup restoration are tested.
