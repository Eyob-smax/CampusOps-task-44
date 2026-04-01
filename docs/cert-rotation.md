# JWT Secret Rotation Runbook

## Overview

CampusOps uses JWT (JSON Web Tokens) for authentication, not TLS certificates
for inter-service communication. This runbook covers how to rotate the
`JWT_SECRET` environment variable safely with minimal user disruption.

---

## When to rotate

- Suspected secret compromise
- Routine security policy rotation (recommended every 90 days)
- Staff departure with potential access to secrets
- After any `.env` file exposure in version control

---

## What happens when you rotate

All currently issued JWTs are signed with the old secret. Once the new secret is
deployed:

- **All existing tokens immediately become invalid.**
- Users will receive `401 Unauthorized` on their next API request.
- Users must log in again to receive a new token signed with the new secret.

Plan rotation during low-traffic periods or maintenance windows.

---

## Step-by-step rotation

### 1. Generate a new secret

```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

Copy the output — this is your new `JWT_SECRET`.

### 2. Update the environment variable

#### Docker / Docker Compose

Edit `docker-compose.yml` or your secrets manager:

```yaml
environment:
  JWT_SECRET: <new-secret-here>
```

#### PM2 / systemd

Edit your `.env` file or systemd unit file:

```
JWT_SECRET=<new-secret-here>
```

#### Kubernetes

Update the secret object:

```bash
kubectl create secret generic campusops-secrets \
  --from-literal=JWT_SECRET=<new-secret-here> \
  --dry-run=client -o yaml | kubectl apply -f -
```

### 3. Restart the backend

```bash
# PM2
pm2 restart campusops-api

# Docker Compose
docker compose up -d --force-recreate api

# Kubernetes
kubectl rollout restart deployment/campusops-api
```

### 4. Verify

```bash
# Health check
curl https://your-domain/api/health

# Attempt login with valid credentials — should return a new token
curl -X POST https://your-domain/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@example.com","password":"..."}'
```

Verify the returned token works for a protected endpoint.

### 5. Communicate to users (if applicable)

If this is a production rotation:
- Notify active users that they will need to log in again.
- Support teams should expect an uptick in "session expired" reports.

---

## Rollback

If the new secret causes unexpected issues:

1. Restore the previous `JWT_SECRET` value.
2. Restart the backend.
3. Users who logged in with the new secret will need to log in again.

---

## Notes

- `JWT_SECRET` is consumed at startup from `process.env.JWT_SECRET` via the
  config module. Never commit this value to version control.
- JWT expiry is configured via `JWT_EXPIRES_IN` (default: `7d`). Shorter
  expiry values reduce the blast radius of a compromised token.
- There is no token revocation list in the current implementation. For
  immediate revocation without full rotation, consider adding a Redis-based
  blocklist.
