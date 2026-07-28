# Event OS Phase 2 Terraform

This directory implements the Vercel-frontend/AWS-backend sample foundation.
It remains apply-gated until the AWS account boundary, remote state, cost owner,
OIDC deployment identity, certificate, domains, and runtime secrets are approved.

## Layout

- `modules/foundation`: shared AWS foundation resources for a single
  environment.
- `modules/application`: RDS, Redis, ECS, ALB, secrets, alarms, and budget.
- `environments/nonprod`: non-production root module.
- `environments/production`: production root module.

## Phase 2 intent

The initial managed runtime candidate is ECS Fargate and the initial database
candidate is RDS PostgreSQL, per the Phase 2 ADRs. EKS, Aurora, OpenSearch,
warm cross-region DR, and cell routing remain trigger-driven future options.

## Apply gate

Before `terraform apply`, produce these approvals:

- AWS account ID and region.
- Terraform state backend bucket/key/lock strategy.
- Cost owner and monthly budget.
- KMS key administrators.
- CI deployment role trust policy.
- Production domain and certificate plan.
- Data classification approval for storage buckets and logs.

Use `../VERCEL_AWS_SAMPLE_RUNBOOK.md` for the two-stage deployment, required
GitHub variables/secrets, database-role bootstrap, Vercel projects, and evidence
gate. Normal API/worker startup never runs Alembic and never receives the RDS
master credential.
