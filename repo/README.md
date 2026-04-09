# CampusOps Fulfillment & Operations Platform

This repository runs as a Docker multi-service stack with TLS termination at `reverse-proxy`.

Canonical deployment and runtime reference:
- `docs/deployment.md`

## Run Application (Docker)

```bash
cd repo
docker compose up --build
```

Before first startup, create runtime secret files from templates and rotate every placeholder:

```bash
mkdir -p repo/runtime-secrets
cp repo/secrets/db_password.txt.example repo/runtime-secrets/db_password.txt
cp repo/secrets/db_root_password.txt.example repo/runtime-secrets/db_root_password.txt
cp repo/secrets/jwt_secret.txt.example repo/runtime-secrets/jwt_secret.txt
cp repo/secrets/encryption_key.txt.example repo/runtime-secrets/encryption_key.txt
```

The backend entrypoint refuses to start outside test mode if any secret or seed password still uses placeholder/default values.

Access:

- Frontend (TLS): `https://localhost`
- Backend API (TLS): `https://localhost/api`
- Health (TLS): `https://localhost/health`

Notes:
- Port `80` is HTTP-to-HTTPS redirect only.
- The backend and frontend containers are not exposed directly on host ports.
- The default certificate is self-signed for disconnected LAN use.

## Seed Accounts (Login)

These are created on first boot only when non-placeholder `SEED_*_PASSWORD` values are configured.

| Role                   | Username      | Password           |
| ---------------------- | ------------- | ------------------ |
| Administrator          | `admin`       | configured via `SEED_ADMIN_PASSWORD` |
| Operations Manager     | `ops_manager` | configured via `SEED_OPS_MANAGER_PASSWORD` |
| Classroom Supervisor   | `supervisor`  | configured via `SEED_SUPERVISOR_PASSWORD` |
| Customer Service Agent | `cs_agent`    | configured via `SEED_CS_AGENT_PASSWORD` |
| Auditor                | `auditor`     | configured via `SEED_AUDITOR_PASSWORD` |

If users are missing because the database was initialized earlier:

```bash
docker compose down -v
docker compose up --build
```

## Run Tests (Docker)

```bash
cd repo
./run_tests.sh
```

If `sh`/`bash` is unavailable (for example in a plain PowerShell terminal), run tests directly with Docker:

```powershell
Set-Location repo
$project = "campusops-test-ps-$([DateTimeOffset]::UtcNow.ToUnixTimeSeconds())"
$env:TEST_PROJECT_NAME = $project
$compose = "docker compose -p $project -f docker-compose.yml -f docker-compose.test.yml"

Invoke-Expression "$compose down -v --remove-orphans"
Invoke-Expression "$compose run --rm --build --no-deps frontend-test-runner"
Invoke-Expression "$compose up -d --build --wait db redis"
Invoke-Expression "$compose run --rm --build --no-deps backend-unit-test-runner"
Invoke-Expression "$compose run --rm --build --no-deps api-test-runner"
Invoke-Expression "$compose down -v --remove-orphans"
```

## Stop Application

```bash
docker compose down
```

## Signup Page

No signup page is required.
Accounts are provisioned through seed/admin workflows for this internal RBAC system.
