# EventX OS Architecture Baseline v1.0

Status: FROZEN

The governing architecture is organized around four layers: current-state baseline, enterprise target state, platform engineering standards, and a trigger-driven roadmap. Major architecture changes require an ADR. Invariant changes require architecture and security review.

Immediate execution order:

1. Phase 0A emergency risk closure.
2. Phase 0B reproducible baseline stabilization.
3. Phase 0C security validation.
4. Phase 1 tenant isolation and deterministic event licensing.
5. Phase 2 reliable managed production infrastructure.

Do not build EKS, OpenSearch, a cell control plane, SCIM, automated dedicated databases, warm cross-region DR, global writes, or hyperscale WebSocket infrastructure until an approved activation trigger and ADR exist.

The detailed source-of-truth and enforcement rules are represented by `architecture-invariants.yaml` and the ADR register.
