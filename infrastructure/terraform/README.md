# EventX OS Phase 2 Terraform

This directory starts the Phase 2 reliable production cloud foundation. It is a
reviewable scaffold only: do not apply it until the AWS account boundary, remote
state location, cost owner, and deployment identity are approved.

## Layout

- `modules/foundation`: shared AWS foundation resources for a single
  environment.
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
