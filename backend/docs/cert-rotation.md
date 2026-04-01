# Runbook: Certificate and Secret Rotation

## Overview

CampusOps uses three categories of secrets that may need rotation:

| Secret           | Location                             | Impact of rotation       |
| ---------------- | ------------------------------------ | ------------------------ |
| `ENCRYPTION_KEY` | Docker secret / `ENCRYPTION_KEY` env | All encrypted DB columns |
| `JWT_SECRET`     | Docker secret / `JWT_SECRET` env     | All active sessions      |
| Carrier API keys | `Carrier.apiKeyEncrypted` DB column  | Carrier sync only        |

---

## 1. Rotating the Encryption Key

**Impact:** `AuditLog.encryptedDetail`, `StoredValue.encryptedBalance`, and
`Carrier.apiKeyEncrypted` are encrypted with AES-256-GCM using `ENCRYPTION_KEY`. Rotating the key
without re-encrypting data will make these columns unreadable.

### Procedure

1. **Plan a maintenance window.** This is a breaking change.

2. **Export encrypted data** (or use a DB snapshot from before rotation).

3. **Generate a new 32-byte key:**

   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```

4. **Write a migration script** that:
   - Reads each encrypted row with the OLD key using `decrypt()`.
   - Re-encrypts with the NEW key using `encrypt()`.
   - Writes the ciphertext back.

5. **Update the secret:**
   - Docker secrets: `docker secret rm encryption_key && echo -n '<new_key>' | docker secret create encryption_key -`
   - Environment: update `ENCRYPTION_KEY` in `.env` / secret manager.

6. **Restart the application:** `docker compose up -d backend`.

7. **Verify:** Read a `StoredValue` balance via the API. A correct decryption returns a numeric value.

### Rollback

If the new key causes decrypt failures, revert `ENCRYPTION_KEY` to the old value and restart.
The old ciphertext is still intact until the migration script overwrites it.

---

## 2. Rotating the JWT Secret

**Impact:** All existing access tokens and refresh tokens are immediately invalidated.
All users will be logged out on their next request.

### Procedure

1. **Generate a new secret:**

   ```bash
   node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
   ```

2. **Update the secret:**
   - Docker secrets: replace `jwt_secret`.
   - Environment: update `JWT_SECRET`.

3. **Restart the application.** No DB migration needed.

4. **Notify users** if planned downtime is expected.

### Rollback

Revert `JWT_SECRET` to the old value and restart. Previously issued tokens (signed with the old key)
will work again.

---

## 3. Rotating a Carrier API Key

Carrier API keys are stored encrypted. Rotation does not require restarting the application.

### Procedure

1. Obtain the new API key from the carrier.

2. Update via API:

   ```
   PATCH /api/carriers/:id
   Authorization: Bearer <admin-token>
   Content-Type: application/json

   { "apiKey": "<new-key>" }
   ```

   The service re-encrypts and stores the new key.

3. Trigger a manual sync to verify connectivity:

   ```
   POST /api/shipments/sync/:carrierId
   Authorization: Bearer <admin-token>
   ```

4. Check logs for `msg: "Carrier sync completed"` with `errors: 0`.

---

## 4. TLS Certificates (if applicable)

If TLS termination is handled at the application level, renew the certificate and update
the file paths in the server configuration. Restart the application.

If TLS is terminated externally (for example, by an infrastructure gateway), no application
restart is needed. Follow the external termination layer's renewal procedure.
