# Business Ambiguities, Assumptions & Implementation Decisions

This document captures every significant ambiguity found in the original prompt and states the explicit assumption adopted by the implementation. These decisions are final for the build and are referenced throughout the codebase.

---

## 1. Classroom Online Status — Definition

**Ambiguity:** The prompt says the dashboard highlights "classroom online status" but does not define what makes a classroom "online" vs "offline."

**Assumption:** A classroom is considered **online** when its associated hardware node (camera/recognition unit) has sent a heartbeat event to the backend within the last **90 seconds**. If no heartbeat is received within 90 seconds, the classroom transitions to **offline**. The transition is broadcast via WebSocket to all connected dashboard clients immediately. A classroom may also be in a **degraded** state when the recognition confidence score drops below a configurable threshold (default 70%).

---

## 2. Anomaly Event Lifecycle

**Ambiguity:** The prompt mentions "acknowledge, assign, and resolve with a required resolution note" but does not specify state transitions, whether multiple operators can work an event simultaneously, or whether acknowledgement locks the event.

**Assumption:**
- States: `open` → `acknowledged` → `assigned` → `resolved` (terminal) | `escalated` (terminal)
- **Acknowledge** marks the event as seen; it does NOT lock it. Any Classroom Supervisor can acknowledge.
- **Assign** sets a specific operator as responsible. Only one operator can be assigned at a time; reassignment is allowed and logged.
- **Resolve** requires a non-empty resolution note (minimum 20 characters). Resolving moves the event to terminal state.
- Events unacknowledged after **30 minutes** are auto-escalated and appear in the supervisor queue. This threshold is configurable by Administrators.
- All state transitions are written to the audit log with actor ID and timestamp.

---

## 3. Supervisor Escalation Mechanics

**Ambiguity:** The prompt defines a 15-minute SLA for parking alerts before escalation to a "supervisor queue" but does not define what "supervisor queue" means in UI or data terms, nor how supervisors dismiss escalations.

**Assumption:**
- The supervisor queue is a dedicated screen visible to users with the `Classroom Supervisor` or `Administrator` role.
- When a parking alert exceeds 15 minutes without closure, a background job (`escalation-checker`) runs every 60 seconds, detects overdue alerts, marks them `escalated`, and emits a WebSocket event to the supervisor queue channel.
- Supervisors can **claim** an escalated alert (sets `claimed_by`) and then **close** it with a mandatory note.
- Claimed alerts are visually differentiated from unclaimed escalations in the queue UI.
- Escalation timestamps are stored. If an escalated alert is not claimed within a further 30 minutes, a second-level alert banner fires (audible + visual).

---

## 4. Membership Coupon Stacking Rules

**Ambiguity:** The prompt mentions "member-only pricing and coupons applied at checkout-like fulfillment requests" but does not state whether multiple coupons can be stacked.

**Assumption:**
- A maximum of **one coupon code** can be applied per fulfillment request.
- Member-only pricing (tier discount) is applied first, then the coupon code is applied on top of the discounted price.
- Coupon codes are validated against: expiry date, minimum order value, single-use flag, and membership tier eligibility.
- Growth points accrual is calculated on the final amount paid after all discounts.
- Stored value, if used, is deducted after coupon discounts are applied.

---

## 5. Stored Value Enablement Strategy

**Ambiguity:** The prompt says stored value is "optional and, if enabled, supports top-up and spending." It is unclear whether this is a per-student opt-in or a system-wide toggle.

**Assumption:**
- Stored value is a **system-wide feature flag** configurable by Administrators in the system settings screen.
- When the flag is `disabled`, stored value balance fields are hidden in all UI views and the top-up/spend APIs return `403 Feature disabled`.
- When `enabled`, each student has one stored value account. The balance is AES-256 encrypted at rest in the database (encrypted column).
- Top-up requires Administrator or Operations Manager role approval for amounts above a configurable threshold (default $200.00 per transaction).
- Spending is deducted atomically within the fulfillment transaction (same DB transaction as the fulfillment record insert). Insufficient balance aborts the transaction with a clear error message.

---

## 6. Compensation Approval Thresholds

**Ambiguity:** The prompt gives one example rule ($10.00 for 48h+ late delivery, capped at $50.00 per ticket) but does not define the complete compensation rule table or approval authority levels.

**Assumption:**
- The system ships with a default compensation rule table seeded in the database:
  | Condition | Suggested Amount | Cap per Ticket |
  |---|---|---|
  | Delivery 24–48h late | $5.00 credit | $25.00 |
  | Delivery >48h late | $10.00 credit | $50.00 |
  | Item lost in transit | $25.00 credit | $100.00 |
  | Disputed item condition | $15.00 credit | $75.00 |
- Administrators can modify the rule table via the admin settings screen.
- Customer Service Agents can **suggest** the auto-calculated compensation. They cannot approve amounts exceeding $25.00.
- Operations Managers can approve up to the cap per ticket.
- Administrators can approve above the cap with a mandatory override note.
- All approvals are recorded in the audit log.

---

## 7. Shipment Sync Retry Policy

**Ambiguity:** The prompt requires "internal connectors to on-prem carrier systems" for tracking sync but does not specify retry behavior when the carrier system is unavailable.

**Assumption:**
- The shipment sync job uses an exponential backoff retry policy: 1st retry after 30s, 2nd after 2m, 3rd after 8m, 4th after 32m, then marks the job as `failed` and emits an observability alert.
- The on-prem carrier connector is a REST adapter; each carrier has its own adapter implementation behind a common `CarrierConnector` interface.
- The connector URL and credentials are configured per carrier in the database (not in env files), encrypted at rest.
- A circuit breaker wraps each carrier adapter: after 5 consecutive failures within 2 minutes, the circuit opens for 10 minutes. During open state, sync jobs for that carrier are skipped and an operator alert is surfaced.
- Sync runs on a configurable schedule (default: every 15 minutes per carrier) as a BullMQ repeatable job.

---

## 8. Masking Scope for PII

**Ambiguity:** The prompt requires "field-level masking for personally identifiable information" but does not enumerate which fields are masked or for which roles.

**Assumption:** The following fields are masked by default in API responses based on role:

| Field | Auditor | Customer Service Agent | Operations Manager | Classroom Supervisor | Administrator |
|---|---|---|---|---|---|
| Student full name | Partial (first name + last initial) | Full | Full | Full | Full |
| Student ID number | Last 4 digits only | Full | Full | Last 4 only | Full |
| Student email | Domain only (`***@domain.edu`) | Full | Full | Masked | Full |
| Student phone | Last 4 digits only | Full | Masked | Masked | Full |
| Stored value balance | Hidden | Hidden | Full | Hidden | Full |

- Masking is applied in the backend serialization layer, not in the database.
- The Auditor role can request a "full reveal" for a specific record, which requires a logged justification. This is recorded in the audit log.

---

## 9. Backup Verification Process

**Ambiguity:** The prompt requires "tested restore procedures" but does not define what constitutes a successful restore test.

**Assumption:**
- The backup flow writes a SQL dump file plus a JSON manifest to the mounted backup disk (`/backups`).
- If `mysqldump` is unavailable in the runtime image, the backup is recorded as manifest-only/failed and the JSON manifest captures the dump failure details for operators.
- 14-day retention is enforced by the cleanup job, which deletes old dump/manifest file pairs and corresponding `BackupRecord` rows.
- Verification is an explicit operational action (`POST /api/backups/:id/verify`) that validates dump presence/non-empty size and manifest shape (`id`, `timestamp`, `tables`, `rowCounts`), then records `verifyStatus`.
- Full restore instructions are documented in `repo/docs/restore.md`; deployment entry points and runtime topology remain in `repo/docs/deployment.md` as source of truth.

---

## 10. Additional Implementation Decisions

- **Idempotency keys:** Mutating endpoints that create or transition business state require an `X-Idempotency-Key` header (UUIDv4). Replay cache keys are namespaced by method + path + canonical body hash + key to prevent cross-endpoint/body collisions.
- **LAN transport:** The default deployment is TLS-first via reverse-proxy (`443`); host port `80` is redirect-only.
- **Rate limiting:** 100 requests/minute per IP on public-facing routes; 20 requests/minute on auth endpoints. Implemented via `express-rate-limit` backed by Redis.
- **Audit log encryption:** Audit log entries are AES-256-GCM encrypted before storage. The decryption key is stored in a Docker secret, not in application code.
- **Image perceptual hash:** Uses average-hash dedup with configurable Hamming threshold (default <=10) and blocks duplicates with HTTP 409.
- **Growth points:** 1 point per $1.00 spent (after discounts). Tier thresholds are configurable. Points do not expire unless explicitly configured by an Administrator.

---

## 11. Evidence Upload Dedup Threshold

**Ambiguity:** How similar must two images be to count as duplicates? The original design referenced a Hamming distance threshold of 10 and said uploaders are "warned but not blocked."

**Decision:** Perceptual aHash (8x8 grayscale average hash, producing a 64-bit fingerprint). Hamming distance <= 10 bits out of 64 (default, configurable) is treated as a duplicate and the upload is **blocked** with HTTP 409. Administrators cannot override duplicate uploads; the same evidence image must not be stored twice.

---

## 12. Carrier Sync Mechanism

**Ambiguity:** The original design described external REST calls to on-prem carrier systems via a `CarrierConnector` interface with circuit breakers and retry policy. How are these implemented without any network access in the LAN-only build?

**Decision:** Carrier sync supports connector and simulation modes:

- `connector` mode calls on-prem carrier endpoints using configured `connectorUrl` and encrypted API key.
- `simulation` mode uses deterministic `simulateCarrierResponse` transitions for offline/test contexts.
- `CARRIER_SYNC_ALLOW_SIMULATION_FALLBACK` controls fallback behavior when connector mode fails.

Simulation status transitions:

| Parcel age | Status assigned |
|---|---|
| < 1 hour | `pending` |
| >= 1 hour | `in_transit` |
| >= 6 hours | `out_for_delivery` |
| >= 24 hours | `delivered` |

The shipment sync worker still applies retry policy and circuit-breaker protections when connector calls are active.

---

## 13. Database Folder Location

**Ambiguity:** The original design had `repo/database/` as a top-level sibling of `backend/` and `frontend/`. This caused a broken Dockerfile `COPY` instruction (`COPY ../database/schema.prisma`) that referenced a path outside the Docker build context (the `backend/` directory).

**Decision:** Moved `repo/database/` inside `repo/backend/database/`. Consequences:

- Docker Compose volume mount updated to `./backend/database/init` (init SQL files).
- The Dockerfile now uses `COPY prisma ./prisma`, referencing the canonical `backend/prisma/schema.prisma`. The `backend/database/` copy is for version-control reference and the seeder script.
- Seed script at `database/seeders/seed.ts` is correctly relative to the backend directory.
- `backend/tsconfig.json` updated to include `database/**/*` so the seeder compiles to `dist/database/seeders/seed.js`.

---

## 14. TLS / HTTPS

**Ambiguity:** Early designs (Q10) oscillated between direct HTTP exposure and TLS-terminated ingress.

**Decision:** The stack uses dedicated reverse-proxy TLS ingress. Port `443` serves frontend/API/socket traffic and port `80` redirects to HTTPS. The backend also supports request-level TLS enforcement via `ENFORCE_TLS`.

---

## 15. Log and Backup Storage

**Ambiguity:** The original design (Q9, section 7 of the architecture ADR) stated that backups produce "a compressed MySQL dump and a tar of the object storage volume." This implied a full database backup.

**Decision:** Backups are stored as a SQL dump file plus a JSON manifest containing row-count metadata. The dump file is the restore artifact, while the manifest supports quick integrity checks and operator validation. In environments where `mysqldump` is unavailable, the system still records a manifest and placeholder SQL file so backup state remains observable. The restore runbook in `repo/docs/restore.md` documents both verification and infrastructure-level recovery workflow.
