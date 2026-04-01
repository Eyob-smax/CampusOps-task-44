# CampusOps Fulfillment & Operations Platform

This repository runs as a Docker multi-service stack with TLS termination at `reverse-proxy`.

Canonical deployment and runtime reference:
- `docs/deployment.md`

## Run Application (Docker)

```bash
cd repo
docker compose up --build
```

Access:

- Frontend (TLS): `https://localhost`
- Backend API (TLS): `https://localhost/api`
- Health (TLS): `https://localhost/health`

Notes:
- Port `80` is HTTP-to-HTTPS redirect only.
- The backend and frontend containers are not exposed directly on host ports.
- The default certificate is self-signed for disconnected LAN use.

## Seed Accounts (Login)

These are created on first boot using default `SEED_*_PASSWORD` values from `docker-compose.yml`.

| Role                   | Username      | Password           |
| ---------------------- | ------------- | ------------------ |
| Administrator          | `admin`       | `Admin#12345`      |
| Operations Manager     | `ops_manager` | `OpsManager#12345` |
| Classroom Supervisor   | `supervisor`  | `Supervisor#12345` |
| Customer Service Agent | `cs_agent`    | `CsAgent#12345`    |
| Auditor                | `auditor`     | `Auditor#12345`    |

If users are missing because the database was initialized earlier:

```bash
docker compose down -v
docker compose up --build
```

## Run Tests (Docker)

```bash
cd repo
bash run_tests.sh
```

## Stop Application

```bash
docker compose down
```

## Signup Page

No signup page is required.
Accounts are provisioned through seed/admin workflows for this internal RBAC system.
