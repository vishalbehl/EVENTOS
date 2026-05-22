# Conf Platform

Monorepo for the conference platform with cloud-hosted apps, venue apps, backend services, workers, and infrastructure.

## Structure

- `cloud/`: cloud-hosted web apps
- `venue/`: venue-facing Electron and PWA apps
- `backend/`: primary FastAPI backend
- `venue-server/`: local venue sync server
- `workers/`: background processing
- `packages/`: shared TypeScript code
- `infrastructure/`: deployment and venue setup assets
- `scripts/`: helper scripts

## Operations

- [Incident playbooks](docs/incident-playbooks.md)
