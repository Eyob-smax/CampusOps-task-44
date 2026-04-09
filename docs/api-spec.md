# API Specification — CampusOps

API endpoints are prefixed with `/api` and served on port 3000 (or port 80 via the frontend Nginx proxy). Health probes are exposed at `/health`. JWT-protected endpoints require `Authorization: Bearer <access_token>`. Hardware ingest endpoints may use API-signing headers instead of JWT.

**Base URL:** `http://localhost/api`  
**Health URL:** `http://localhost/health`

**Common response envelope:**

```json
{ "success": true, "data": { ... } }
{ "success": false, "error": "Human-readable message", "code": "ERROR_CODE" }
```

Some legacy/list endpoints still return raw JSON payloads without the `success/data` wrapper; endpoint sections below show canonical shapes where relevant.

Idempotency policy: mutating endpoints that create or transition business state require `X-Idempotency-Key` (UUIDv4). File evidence upload endpoints are intentionally excluded from idempotency replay caching. Concurrent duplicates reserve the key atomically; callers may receive `409 IDEMPOTENCY_IN_PROGRESS` while the first request is still running.

**Common error codes:**

| HTTP | Code | Meaning |
|---|---|---|
| 400 | `VALIDATION_ERROR` | Request body or params failed validation |
| 401 | `UNAUTHORIZED` | Missing or invalid token |
| 403 | `FORBIDDEN` | Token valid but insufficient permissions |
| 404 | `NOT_FOUND` | Resource does not exist |
| 409 | `CONFLICT` | Duplicate resource or idempotency conflict |
| 409 | `IDEMPOTENCY_IN_PROGRESS` | Same idempotency key/body is currently being processed |
| 429 | `RATE_LIMITED` | Too many requests |
| 500 | `INTERNAL_ERROR` | Unexpected server error |

---

## Health

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/health` | None | Liveness probe |
| GET | `/health/ready` | None | Readiness probe (DB + Redis checks) |
| GET | `/health/info` | JWT + `metrics:read` | Service metadata |

**Liveness response (`GET /health`):**
```json
{ "status": "ok", "uptime": 1234 }
```

**Readiness response (`GET /health/ready`):**
```json
{ "status": "ready", "checks": { "database": "ok", "redis": "ok" } }
```

---

## 1. Authentication (`/api/auth`)

| Method | Path | Auth | Key request fields | Key response |
|---|---|---|---|---|
| POST | `/api/auth/login` | None | `username`, `password` | `accessToken`, `refreshToken`, `expiresIn`, `user: { id, username, role, campusId }` |
| POST | `/api/auth/refresh` | None | `refreshToken` | `accessToken`, `refreshToken` |
| POST | `/api/auth/logout` | JWT | — | `{ success: true }` |
| GET | `/api/auth/me` | JWT | — | `{ id, username, role, campusId }` |
| POST | `/api/auth/change-password` | JWT | `currentPassword`, `newPassword` | `{ success: true }` |

`POST /api/auth/refresh` accepts refresh token from request body (`refreshToken`) or secure HttpOnly cookie (`refreshToken`).

**Rate limit:** 20 req/min per IP on all `/api/auth/*` endpoints.

**Error codes specific to auth:**

| Code | Meaning |
|---|---|
| `INVALID_CREDENTIALS` | Username or password incorrect |
| `ACCOUNT_INACTIVE` | User account is deactivated |
| `TOKEN_EXPIRED` | Access token has expired — use refresh |
| `TOKEN_INVALID` | Token signature invalid or malformed |

---

## 2. Admin

### Audit Logs (`/api/admin/audit`)

Required permission: `audit:read`

| Method | Path | Auth | Key query params | Key response |
|---|---|---|---|---|
| GET | `/api/admin/audit` | JWT | `actorId`, `action`, `entityType`, `from`, `to`, `page`, `limit` | `{ data: AuditLog[], total, page, limit }` |
| POST | `/api/admin/audit/reveal/:id` | JWT | `justification` (min 10 chars) | Reveals decrypted detail for the specific audit-log primary key `id` |

`POST /reveal/:id` requires permission `audit:reveal-pii`. The `:id` path param is the audit log row primary key (not `entityId`). Each reveal call writes an `audit:pii-revealed` audit entry with the provided justification.

### Users (`/api/admin/users`)

Required permission: `users:read` (list/get); `users:create`/`users:update`/`users:delete` for mutations.

| Method | Path | Key request fields | Key response |
|---|---|---|---|
| GET | `/api/admin/users` | — | `{ data: User[], total }` |
| GET | `/api/admin/users/:id` | — | `User` |
| POST | `/api/admin/users` | `username`, `password`, `role` | `User` |
| PATCH | `/api/admin/users/:id` | `username`, `isActive` | `User` |
| PATCH | `/api/admin/users/:id/role` | `role` | `User` |
| POST | `/api/admin/users/:id/reset-password` | `newPassword` | `{ success: true }` |
| DELETE | `/api/admin/users/:id` | — | `{ success: true }` |

POST requires `X-Idempotency-Key` header (UUIDv4).

### Settings (`/api/admin/settings`)

| Method | Path | Permission | Key request/response |
|---|---|---|---|
| GET | `/api/admin/settings` | `settings:read` | Returns settings map in response `data` |
| PATCH | `/api/admin/settings` | `settings:update` | Body: `Record<string, string>`; returns success message |
| GET | `/api/admin/settings/thresholds` | `alerts:manage` | `AlertThreshold[]` |
| PUT | `/api/admin/settings/thresholds` | `alerts:manage` | Upsert threshold (`metricName`, `operator`, `value`, `isActive`) |
| GET | `/api/admin/settings/backups` | `backup:read` | `BackupRecord[]` |
| GET | `/api/admin/settings/keys` | `integration-keys:manage` | `IntegrationKey[]` |
| POST | `/api/admin/settings/keys` | `integration-keys:manage` | Request: `name`, `scope` (`classroom`/`parking`/`carrier`); response includes one-time `{ keyId, secret, id }` |
| POST | `/api/admin/settings/keys/:id/rotate` | `integration-keys:manage` | `{ keyId, secret }` |
| DELETE | `/api/admin/settings/keys/:id` | `integration-keys:manage` | Success message |

---

## 3. Master Data

### Departments (`/api/departments`)

Permission: `master-data:read` / `master-data:write`

| Method | Path | Key fields |
|---|---|---|
| GET | `/api/departments` | List with optional `?isActive=true` |
| GET | `/api/departments/export` | CSV/XLSX download (`?format=csv|xlsx`, default `csv`) |
| GET | `/api/departments/:id` | Single department |
| POST | `/api/departments` | `name`, `code` |
| PUT | `/api/departments/:id` | `name`, `code`, `isActive` |
| DELETE | `/api/departments/:id` | Soft-deactivate |

### Semesters (`/api/semesters`)

Same CRUD pattern as departments; export supports `?format=csv|xlsx`. Fields: `name`, `startDate`, `endDate`, `isActive`.

### Courses (`/api/courses`)

Fields: `code`, `name`, `departmentId`, `isActive`. Export supports `?format=csv|xlsx`.

### Classes (`/api/classes`)

Fields: `name`, `courseId`, `departmentId`, `semesterId`, `roomNumber`, `isActive`. Export supports `?format=csv|xlsx`.

### Students (`/api/students`)

Permission: `master-data:read`; writes require `students:write`. Auditor write operations blocked.
Campus isolation: student read/write/export operations are constrained by authenticated `campusId` scope.

| Method | Path | Key fields / notes |
|---|---|---|
| GET | `/api/students` | PII masked per role |
| GET | `/api/students/export` | CSV/XLSX (`?format=csv|xlsx`, default `csv`); PII masked per role |
| GET | `/api/students/:id` | PII masked per role |
| POST | `/api/students` | `studentNumber`, `fullName`, `email`, `phone`, `departmentId`; requires `X-Idempotency-Key` |
| PUT | `/api/students/:id` | Any student fields |
| DELETE | `/api/students/:id` | Soft-deactivate |
| POST | `/api/students/import` | Multipart CSV/XLSX upload; queues `campusops-bulk-import` job with caller `campusId` scope |

---

## 4. Jobs (`/api/jobs`)

Permission: `jobs:read` / `jobs:manage`

| Method | Path | Notes |
|---|---|---|
| GET | `/api/jobs` | List job records in caller campus scope |
| GET | `/api/jobs/:id` | Single job record with status and progress (campus-scoped) |
| GET | `/api/jobs/:id/error-report` | Download error report CSV (bulk import failures, campus-scoped) |
| POST | `/api/jobs/:id/retry` | Re-queue a failed job in the same campus scope; requires `X-Idempotency-Key` |

**Job record fields:** `id`, `queueName`, `jobName`, `bullJobId`, `campusId`, `status` (`waiting`/`active`/`completed`/`failed`/`delayed`/`stalled`), `progress` (0–100), `totalRows`, `processedRows`, `failedRows`, `actorId`, `inputFilename`, `result`, `hasErrorReport`, `errorMsg`, `attempts`, `maxAttempts`, `startedAt`, `finishedAt`, `createdAt`, `updatedAt`.

---

## 5. Classroom Operations

### Classrooms (`/api/classrooms`)

Permission: `classroom:read` / `classroom:manage`
Campus isolation: classroom reads are constrained by authenticated `campusId` scope.

| Method | Path | Key request/response |
|---|---|---|
| GET | `/api/classrooms` | List all classrooms with status |
| GET | `/api/classrooms/stats` | `{ online, offline, degraded, total }` |
| GET | `/api/classrooms/:id` | Classroom detail including latest anomalies |
| POST | `/api/classrooms/heartbeat/:nodeId` | Body: `{ confidence?: number }`; updates `lastHeartbeatAt` and status; requires API signing key with `classroom` scope |

### Anomaly Events (`/api/anomalies`)

Permission: `classroom:read` / `classroom:manage` / `anomaly:acknowledge` / `anomaly:assign` / `anomaly:resolve`
Campus isolation: anomaly reads/transitions are constrained by authenticated `campusId` scope.

| Method | Path | Key fields |
|---|---|---|
| GET | `/api/anomalies` | Query: `classroomId`, `status`, `from`, `to`, `page`, `limit` |
| GET | `/api/anomalies/:id` | Includes timeline entries |
| POST | `/api/anomalies` | `classroomId`, `type`, `description` |
| PATCH | `/api/anomalies/:id/acknowledge` | — |
| PATCH | `/api/anomalies/:id/assign` | `assignedToId` |
| PATCH | `/api/anomalies/:id/resolve` | `resolutionNote` (min 20 chars) |
| PATCH | `/api/anomalies/:id/escalate` | — |

---

## 6. Parking

### Parking (`/api/parking`)

Permission: `parking:read` / `parking:manage`
Campus isolation: parking lots, sessions, and dashboard aggregates are constrained by authenticated `campusId` scope.

| Method | Path | Key fields |
|---|---|---|
| GET | `/api/parking/dashboard` | Aggregate dashboard: `totalLots`, `totalSpaces`, `occupiedSpaces`, `availableSpaces`, `occupancyPct`, `turnoverPerHour`, `activeAlerts`, `escalatedAlerts`, `lots[]` |
| GET | `/api/parking/lots` | Query: `active` (default active only), `search` |
| GET | `/api/parking/lots/:id/stats` | `lotId`, `name`, `totalSpaces`, `occupiedSpaces`, `availableSpaces`, `occupancyPct`, `entriesLastHour`, `turnoverRate`, `avgDwellMinutes` |
| GET | `/api/parking/sessions` | Query: `lotId`, `plateNumber`, `active`, `from`, `to`, `page`, `limit` |
| POST | `/api/parking/sessions/entry` | `lotId`, `plateNumber`; requires API signing key with `parking` scope |
| POST | `/api/parking/sessions/exit` | `sessionId`; requires API signing key with `parking` scope |

### Parking Alerts (`/api/parking-alerts`)

Permission: `parking:read` / `parking:manage` / `parking-alert:claim` / `parking-alert:close`
Campus isolation: alert lists/details/metrics and state transitions are constrained by authenticated `campusId` scope.

| Method | Path | Key fields |
|---|---|---|
| GET | `/api/parking-alerts` | Query: `status`, `lotId`, `page`, `limit` |
| GET | `/api/parking-alerts/metrics` | `{ open, claimed, closed, escalated, avgResolutionMinutes }` |
| GET | `/api/parking-alerts/:id` | Includes timeline |
| POST | `/api/parking-alerts` | `lotId`, `type`, `description` |
| PATCH | `/api/parking-alerts/:id/claim` | — |
| PATCH | `/api/parking-alerts/:id/close` | `closureNote` (required) |
| PATCH | `/api/parking-alerts/:id/escalate` | — |

---

## 7. Logistics

### Warehouses (`/api/warehouses`)

Permission: `warehouse:read` / `warehouse:write`

| Method | Path | Key fields |
|---|---|---|
| GET | `/api/warehouses` | List |
| GET | `/api/warehouses/:id` | Detail |
| POST | `/api/warehouses` | `name`, `address`, `isActive` |
| PUT | `/api/warehouses/:id` | Any warehouse fields |

### Carriers (`/api/carriers`)

Permission: `carrier:read` / `carrier:write`

| Method | Path | Key fields |
|---|---|---|
| GET | `/api/carriers` | List |
| GET | `/api/carriers/:id` | Detail |
| POST | `/api/carriers` | `name`, `connectorUrl`, `apiKey` |
| PUT | `/api/carriers/:id` | `name`, `connectorUrl`, `apiKey`, `isActive` |

Carrier responses expose `hasApiKey` and never return encrypted API key material.

### Delivery Zones (`/api/delivery-zones`)

Permission: `delivery-zone:read` / `delivery-zone:write`. Zip check requires no auth.

| Method | Path | Key fields |
|---|---|---|
| GET | `/api/delivery-zones/check/:zipCode` | Returns serviceability payload (`serviceable`, `zone`, `zipEntry`) |
| GET | `/api/delivery-zones` | List all zones |
| GET | `/api/delivery-zones/:id` | Zone with zip codes |
| POST | `/api/delivery-zones` | `name`, `regionCode`, `isActive?` |
| PUT | `/api/delivery-zones/:id` | `name?`, `regionCode?`, `isActive?` |
| POST | `/api/delivery-zones/:id/zips` | `zipCode`, `isNonServiceable?` |
| DELETE | `/api/delivery-zones/:id/zips/:zipCode` | — |

### Shipping Templates (`/api/shipping-templates`)

Permission: `shipping-template:read` / `shipping-template:write`

| Method | Path | Key fields |
|---|---|---|
| POST | `/api/shipping-templates/calculate` | `templateId?`, `zoneId?`, `tier?`, `weightLb`, `itemCount`, `regionCode`; returns `{ fee }` |
| GET | `/api/shipping-templates` | List |
| GET | `/api/shipping-templates/:id` | Detail |
| POST | `/api/shipping-templates` | `name`, `zoneId`, `tier`, `baseFee`, `baseWeightLb`, `perLbFee`, `maxItems?`, `perItemFee?`, `surchargeAk?`, `surchargeHi?`, `isActive?` |
| PUT | `/api/shipping-templates/:id` | Any subset of template fields from create payload |

`POST /calculate` accepts either `templateId` or the pair (`zoneId` + `tier`).

---

## 8. Membership and Fulfillment

### Membership Tiers (`/api/membership/tiers`)

Permission: `membership:read` / `membership:write`

| Method | Path | Key fields |
|---|---|---|
| GET | `/api/membership/tiers` | List tiers |
| GET | `/api/membership/tiers/:id` | Single tier |
| POST | `/api/membership/tiers` | `name`, `discountPercent`, `pointsMultiplier`, `minPoints` |
| PUT | `/api/membership/tiers/:id` | Any tier fields |

### Coupons (`/api/coupons`)

Permission: `coupon:read` / `coupon:write`

| Method | Path | Key fields |
|---|---|---|
| POST | `/api/coupons/validate` | `code`, `studentTierId?`, `orderSubtotal`; returns `{ coupon, discountAmount }` |
| GET | `/api/coupons` | List |
| GET | `/api/coupons/:id` | Detail |
| POST | `/api/coupons` | `code`, `discountType` (`flat`/`percent`), `discountValue`, `minimumOrderValue?`, `tierId?`, `isSingleUse?`, `maxUsage?`, `expiresAt?` |
| PUT | `/api/coupons/:id` | Any coupon fields |

### Fulfillment (`/api/fulfillment`)

Permission: `fulfillment:read` / `fulfillment:create` / `fulfillment:manage`

Campus isolation: all fulfillment queries and mutations are constrained by authenticated `campusId` scope.
PII masking: student fields in fulfillment read responses are role-masked (`auditor` and `classroom_supervisor` receive masked identifiers/contact fields).

| Method | Path | Key fields / notes |
|---|---|---|
| GET | `/api/fulfillment` | Query: `studentId`, `status`, `page` |
| GET | `/api/fulfillment/:id` | Includes coupon and stored-value breakdown |
| POST | `/api/fulfillment` | `studentId`, `items[]`, `couponCode?`, `storedValueAmount?`, `zoneId?`, `tier?`; requires `X-Idempotency-Key` |
| PATCH | `/api/fulfillment/:id/status` | `status` (`processing`/`shipped`/`delivered`/`cancelled` based on current state); requires `X-Idempotency-Key` |
| PATCH | `/api/fulfillment/:id/cancel` | Cancels and reverses stored-value deductions |

**Fulfillment statuses:** `pending`, `processing`, `shipped`, `delivered`, `cancelled`

Shipping fee selection rules:
- `zoneId` and `tier` must be provided together when used.
- Invalid or inactive `zoneId` returns `422 INVALID_SHIPPING_ZONE`.
- Stored-value deduction is revalidated inside transaction to prevent stale-balance races.

### Stored Value (`/api/stored-value`)

Permission: `stored-value:read` / `stored-value:topup` / `stored-value:spend`

| Method | Path | Key fields |
|---|---|---|
| GET | `/api/stored-value/:studentId/balance` | Returns decrypted balance (role-gated) |
| POST | `/api/stored-value/:studentId/top-up` | `amount`, `note?` |
| POST | `/api/stored-value/:studentId/spend` | `amount`, `referenceId`, `referenceType`; atomic deduction |
| GET | `/api/stored-value/:studentId/transactions` | Query: `page`, `limit`, `type`; paginated transaction history |
| GET | `/api/stored-value/transactions/:id/receipt` | Plain-text receipt (`text/plain`) |

Stored value policy constraints:
- Returns `403 Feature disabled` (`FEATURE_DISABLED`) when `stored_value_enabled` is `false`.
- Top-up amounts above `stored_value_topup_approval_threshold` (default `$200.00`) require an Administrator or Operations Manager approver context.
- Campus isolation is enforced through JWT `campusId` scope on student/transaction access.

---

## 9. Shipments and After-Sales

### Shipments (`/api/shipments`)

Permission: `shipment:read` / `shipment:write` / `shipment:intervene`

Object-level scope: `customer_service_agent` reads are scoped to shipment records linked to fulfillment requests they created.
Campus isolation: all shipment queries and mutations are constrained by authenticated `campusId` scope.

| Method | Path | Key fields |
|---|---|---|
| GET | `/api/shipments` | Query: `carrierId`, `status`, `page` |
| GET | `/api/shipments/:id` | Includes parcels |
| POST | `/api/shipments` | `fulfillmentRequestId`, `carrierId`, `warehouseId`, `estimatedDeliveryAt?` |
| PATCH | `/api/shipments/:id/status` | `status` (manual override) |
| POST | `/api/shipments/sync/:carrierId` | Triggers immediate carrier sync for a carrier |
| POST | `/api/shipments/sync-signed/:carrierId` | Signed sync trigger for connectors; requires API signing key with `carrier` scope |

### Parcels (`/api/parcels`)

Permission: `shipment:read` / `shipment:write`
Object-level scope: `customer_service_agent` parcel reads are constrained through the parent shipment ownership rules.
Campus isolation: parcel access is constrained through parent shipment `campusId` scope.

| Method | Path | Key fields |
|---|---|---|
| GET | `/api/parcels` | Query: `shipmentId` |
| GET | `/api/parcels/:id` | Includes carrier timeline JSON |
| POST | `/api/parcels` | `shipmentId`, `trackingNumber`, `description?`, `weightLb?` |
| PATCH | `/api/parcels/:id/status` | `status` |

**Parcel statuses:** `pending`, `in_transit`, `out_for_delivery`, `delivered`, `exception`, `returned`

### After-Sales Tickets (`/api/after-sales`)

Permission: `after-sales:read` / `after-sales:create` / `after-sales:manage`

Object-level scope: `customer_service_agent` access is limited to tickets they created (including evidence and compensation operations under that ticket).
Campus isolation: all ticket, evidence, and compensation access is constrained by authenticated `campusId` scope.
Response contract: after-sales ticket, evidence, and compensation endpoints return `{ success, data }` envelopes.
PII masking: embedded student fields in ticket responses are role-masked (`auditor` and `classroom_supervisor` receive masked identifiers/contact fields).

| Method | Path | Key fields / notes |
|---|---|---|
| GET | `/api/after-sales` | Query: `studentId`, `type`, `status`, `slaAtRisk`, `page` |
| GET | `/api/after-sales/:id` | Includes evidence files and compensations |
| POST | `/api/after-sales` | `studentId`, `shipmentId`, `type` (`delay`/`dispute`/`lost_item`), `description`; auto-suggests compensation on `delay` type |
| PATCH | `/api/after-sales/:id/status` | `status` (`open`/`under_review`/`pending_approval`/`resolved`/`closed`) |

**Evidence:**

| Method | Path | Notes |
|---|---|---|
| POST | `/api/after-sales/:id/evidence/image` | Multipart `file` field; JPEG/PNG; max 10MB; aHash dedup |
| POST | `/api/after-sales/:id/evidence/text` | `{ note: string }` |

**Compensations:**

| Method | Path | Permission | Key fields |
|---|---|---|---|
| GET | `/api/after-sales/:id/compensations` | `after-sales:read` | List compensations |
| POST | `/api/after-sales/:id/compensations/suggest` | `compensation:suggest` | Auto-calculated from `CompensationRule`; requires `X-Idempotency-Key` |
| PATCH | `/api/after-sales/:id/compensations/:cid/approve` | any of `compensation:approve-limited` / `compensation:approve-full` / `compensation:approve-override` | `{ note?: string }`; enforces `(ticketId,cid)` binding and tier limits |
| PATCH | `/api/after-sales/:id/compensations/:cid/reject` | any of `compensation:approve-limited` / `compensation:approve-full` / `compensation:approve-override` | `{ note?: string }`; enforces `(ticketId,cid)` binding |

Approved credit compensations call `storedValueService.topUp()` within the same approval flow.

---

## 10. Observability

### Metrics (`/api/metrics`)

Permission: `metrics:read`

| Method | Path | Response |
|---|---|---|
| GET | `/api/metrics` | Latest snapshot for each metric name: `[{ metricName, value, recordedAt }]` |
| GET | `/api/metrics/:name/history` | Time-series array; query: `from`, `to`, `limit` |

**Metric names:** `cpu_utilization_percent`, `api_latency_p95_ms`, `api_error_rate_percent`, `memory_used_mb`, `memory_free_mb`, `active_jobs`, `open_parking_alerts`, `open_after_sales_tickets`

### Alert History (`/api/alerts`)

Permission: `alerts:read` / `alerts:manage`

| Method | Path | Notes |
|---|---|---|
| GET | `/api/alerts` | Query: `acknowledged`, `metricName`, `from`, `to`, `page` |
| PATCH | `/api/alerts/:id/acknowledge` | Sets `acknowledgedAt`; requires `X-Idempotency-Key` |

### Thresholds (`/api/thresholds`)

Permission: `alerts:read` (GET) / `alerts:manage` (write)

| Method | Path | Key fields |
|---|---|---|
| GET | `/api/thresholds` | All thresholds |
| GET | `/api/thresholds/:id` | Single threshold |
| POST | `/api/thresholds` | `metricName`, `operator` (`>`,`<`,`>=`,`<=`,`==`; aliases `gt`/`lt`/`gte`/`lte`/`eq` accepted), `value`, `isActive` |
| PUT | `/api/thresholds/:id` | Any threshold fields |
| DELETE | `/api/thresholds/:id` | Hard delete |

### Logs (`/api/logs`)

Permission: `logs:read`

| Method | Path | Query params |
|---|---|---|
| GET | `/api/logs` | `service`, `severity` (`error`/`warn`/`info`/`debug`), `correlationId`, `actor`, `domain`, `search` (text search), `from`, `to`, `page`, `limit` |

Response: `{ success: true, data: { items: LogEntry[], total, page, limit } }`

### Backups (`/api/backups`)

Permission: `backup:read` / `backup:manage`

| Method | Path | Notes |
|---|---|---|
| GET | `/api/backups` | Query: `status`, `page`, `limit` |
| GET | `/api/backups/:id` | Single backup record |
| POST | `/api/backups` | Trigger immediate backup; returns `BackupRecord` |
| POST | `/api/backups/:id/verify` | Strict manifest verification against current schema tables and row counts; returns `{ passed, details }` |

**BackupRecord fields:** `id`, `fileName`, `filePath`, `status` (`running`/`completed`/`failed`), `verifyStatus` (`pending`/`passed`/`failed`), `startedAt`, `finishedAt`, `errorMsg`
