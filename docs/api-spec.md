# API Specification — CampusOps

All endpoints are prefixed with `/api` and served on port 3000 (or port 80 via the frontend Nginx proxy). All authenticated endpoints require `Authorization: Bearer <access_token>`.

**Base URL:** `http://localhost/api`

**Standard response envelope:**

```json
{ "success": true, "data": { ... } }
{ "success": false, "error": "Human-readable message", "code": "ERROR_CODE" }
```

**Common error codes:**

| HTTP | Code | Meaning |
|---|---|---|
| 400 | `VALIDATION_ERROR` | Request body or params failed validation |
| 401 | `UNAUTHORIZED` | Missing or invalid token |
| 403 | `FORBIDDEN` | Token valid but insufficient permissions |
| 404 | `NOT_FOUND` | Resource does not exist |
| 409 | `CONFLICT` | Duplicate resource or idempotency conflict |
| 429 | `RATE_LIMITED` | Too many requests |
| 500 | `INTERNAL_ERROR` | Unexpected server error |

---

## Health

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/health` | None | Returns service health |

**Response:**
```json
{ "status": "ok", "db": "connected", "redis": "connected", "uptime": 1234 }
```

---

## 1. Authentication (`/api/auth`)

| Method | Path | Auth | Key request fields | Key response |
|---|---|---|---|---|
| POST | `/api/auth/login` | None | `username`, `password` | `accessToken`, `refreshToken`, `user: { id, username, role }` |
| POST | `/api/auth/refresh` | None | `refreshToken` | `accessToken`, `refreshToken` |
| POST | `/api/auth/logout` | JWT | — | `{ success: true }` |
| GET | `/api/auth/me` | JWT | — | `{ id, username, role, isActive }` |
| POST | `/api/auth/change-password` | JWT | `currentPassword`, `newPassword` | `{ success: true }` |

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
| POST | `/api/admin/audit/reveal/:id` | JWT | — | `{ detail: { ... } }` (decrypted) |

`POST /reveal/:id` requires permission `audit:reveal-pii`. Creates an audit entry logging the reveal action.

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
| GET | `/api/admin/settings` | `settings:read` | `{ settings: Record<string, string> }` |
| PATCH | `/api/admin/settings` | `settings:update` | Body: `{ key: string, value: string }[]` |
| GET | `/api/admin/settings/thresholds` | `alerts:manage` | `AlertThreshold[]` |
| PUT | `/api/admin/settings/thresholds` | `alerts:manage` | Upsert threshold |
| GET | `/api/admin/settings/backups` | `backup:read` | `BackupRecord[]` |
| GET | `/api/admin/settings/keys` | `integration-keys:manage` | `IntegrationKey[]` |
| POST | `/api/admin/settings/keys` | `integration-keys:manage` | `{ keyId, secret }` |
| POST | `/api/admin/settings/keys/:id/rotate` | `integration-keys:manage` | `{ keyId, secret }` |
| DELETE | `/api/admin/settings/keys/:id` | `integration-keys:manage` | `{ success: true }` |

---

## 3. Master Data

### Departments (`/api/departments`)

Permission: `master-data:read` / `master-data:write`

| Method | Path | Key fields |
|---|---|---|
| GET | `/api/departments` | List with optional `?isActive=true` |
| GET | `/api/departments/export` | CSV download |
| GET | `/api/departments/:id` | Single department |
| POST | `/api/departments` | `name`, `code` |
| PUT | `/api/departments/:id` | `name`, `code`, `isActive` |
| DELETE | `/api/departments/:id` | Soft-deactivate |

### Semesters (`/api/semesters`)

Same CRUD pattern as departments. Fields: `name`, `startDate`, `endDate`, `isActive`.

### Courses (`/api/courses`)

Fields: `code`, `name`, `departmentId`, `isActive`.

### Classes (`/api/classes`)

Fields: `name`, `courseId`, `departmentId`, `semesterId`, `roomNumber`, `isActive`.

### Students (`/api/students`)

Permission: `master-data:read`; writes require `students:write`. Auditor write operations blocked.

| Method | Path | Key fields / notes |
|---|---|---|
| GET | `/api/students` | PII masked per role |
| GET | `/api/students/export` | CSV; PII masked per role |
| GET | `/api/students/:id` | PII masked per role |
| POST | `/api/students` | `studentNumber`, `fullName`, `email`, `phone`, `departmentId`; requires `X-Idempotency-Key` |
| PUT | `/api/students/:id` | Any student fields |
| DELETE | `/api/students/:id` | Soft-deactivate |
| POST | `/api/students/import` | Multipart CSV upload; queues `campusops:bulk-import` job |

---

## 4. Jobs (`/api/jobs`)

Permission: `jobs:read` / `jobs:manage`

| Method | Path | Notes |
|---|---|---|
| GET | `/api/jobs` | List all job records |
| GET | `/api/jobs/:id` | Single job record with status and progress |
| GET | `/api/jobs/:id/error-report` | Download error report CSV (bulk import failures) |
| POST | `/api/jobs/:id/retry` | Re-queue a failed job; requires `X-Idempotency-Key` |

**Job record fields:** `id`, `name`, `queue`, `status` (`pending`, `active`, `completed`, `failed`), `progress` (0–100), `result`, `errorReport`, `createdAt`, `finishedAt`.

---

## 5. Classroom Operations

### Classrooms (`/api/classrooms`)

Permission: `classroom:read` / `classroom:manage`

| Method | Path | Key request/response |
|---|---|---|
| GET | `/api/classrooms` | List all classrooms with status |
| GET | `/api/classrooms/stats` | `{ online, offline, degraded, total }` |
| GET | `/api/classrooms/:id` | Classroom detail including latest anomalies |
| POST | `/api/classrooms/heartbeat/:nodeId` | Body: `{ confidence?: number }`; updates `lastHeartbeatAt` and status |

### Anomaly Events (`/api/anomalies`)

Permission: `classroom:read` / `classroom:manage` / `anomaly:acknowledge` / `anomaly:assign` / `anomaly:resolve`

| Method | Path | Key fields |
|---|---|---|
| GET | `/api/anomalies` | Query: `classroomId`, `status`, `from`, `to`, `page`, `limit` |
| GET | `/api/anomalies/:id` | Includes timeline entries |
| POST | `/api/anomalies` | `classroomId`, `type`, `description` |
| PATCH | `/api/anomalies/:id/acknowledge` | — |
| PATCH | `/api/anomalies/:id/assign` | `assignToUserId` |
| PATCH | `/api/anomalies/:id/resolve` | `resolutionNote` (min 20 chars) |
| PATCH | `/api/anomalies/:id/escalate` | — |

---

## 6. Parking

### Parking (`/api/parking`)

Permission: `parking:read` / `parking:manage`

| Method | Path | Key fields |
|---|---|---|
| GET | `/api/parking/dashboard` | `{ lots: [{ id, name, totalSpaces, occupied, available }] }` |
| GET | `/api/parking/lots` | List all lots |
| GET | `/api/parking/lots/:id/stats` | `{ occupancy, sessions, alerts }` |
| GET | `/api/parking/sessions` | Query: `lotId`, `plateNumber`, `from`, `to`, `page` |
| POST | `/api/parking/sessions/entry` | `lotId`, `plateNumber` |
| POST | `/api/parking/sessions/exit` | `sessionId` or `plateNumber` + `lotId` |

### Parking Alerts (`/api/parking-alerts`)

Permission: `parking:read` / `parking:manage` / `parking-alert:claim` / `parking-alert:close`

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
| POST | `/api/carriers` | `name`, `code`, `isActive` |
| PUT | `/api/carriers/:id` | Any carrier fields |

### Delivery Zones (`/api/delivery-zones`)

Permission: `delivery-zone:read` / `delivery-zone:write`. Zip check requires no auth.

| Method | Path | Key fields |
|---|---|---|
| GET | `/api/delivery-zones/check/:zipCode` | Returns `{ zoneId, zoneName, carrierId }` or 404 |
| GET | `/api/delivery-zones` | List all zones |
| GET | `/api/delivery-zones/:id` | Zone with zip codes |
| POST | `/api/delivery-zones` | `name`, `carrierId` |
| PUT | `/api/delivery-zones/:id` | `name`, `isActive` |
| POST | `/api/delivery-zones/:id/zips` | `zipCode` |
| DELETE | `/api/delivery-zones/:id/zips/:zipCode` | — |

### Shipping Templates (`/api/shipping-templates`)

Permission: `shipping-template:read` / `shipping-template:write`

| Method | Path | Key fields |
|---|---|---|
| POST | `/api/shipping-templates/calculate` | `templateId`, `weightKg`; returns `{ fee }` |
| GET | `/api/shipping-templates` | List |
| GET | `/api/shipping-templates/:id` | Detail |
| POST | `/api/shipping-templates` | `name`, `baseRate`, `perKgRate`, `carrierId`, `deliveryZoneId` |
| PUT | `/api/shipping-templates/:id` | Any template fields |

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
| POST | `/api/coupons/validate` | `code`, `studentId`, `orderAmount`; returns `{ valid, discount, finalAmount }` |
| GET | `/api/coupons` | List |
| GET | `/api/coupons/:id` | Detail |
| POST | `/api/coupons` | `code`, `discountType` (`percent`/`fixed`), `discountValue`, `maxUses`, `expiresAt`, `minOrderValue`, `tierRestriction` |
| PUT | `/api/coupons/:id` | Any coupon fields |

### Fulfillment (`/api/fulfillment`)

Permission: `fulfillment:read` / `fulfillment:create` / `fulfillment:manage`

| Method | Path | Key fields / notes |
|---|---|---|
| GET | `/api/fulfillment` | Query: `studentId`, `status`, `page` |
| GET | `/api/fulfillment/:id` | Includes coupon and stored-value breakdown |
| POST | `/api/fulfillment` | `studentId`, `items`, `couponCode?`, `useStoredValue?`, `shippingTemplateId`; requires `X-Idempotency-Key` |
| PATCH | `/api/fulfillment/:id/status` | `status` |
| PATCH | `/api/fulfillment/:id/cancel` | Cancels and reverses stored-value deductions |

### Stored Value (`/api/stored-value`)

Permission: `stored-value:read` / `stored-value:topup` / `stored-value:spend`

| Method | Path | Key fields |
|---|---|---|
| GET | `/api/stored-value/:studentId/balance` | Returns decrypted balance (role-gated) |
| POST | `/api/stored-value/:studentId/top-up` | `amount`, `reference` |
| POST | `/api/stored-value/:studentId/spend` | `amount`, `reference`; atomic deduction |
| GET | `/api/stored-value/:studentId/transactions` | Paginated transaction history |
| GET | `/api/stored-value/transactions/:id/receipt` | Receipt detail |

Returns `403 Feature disabled` when `storedValueEnabled` system setting is `false`.

---

## 9. Shipments and After-Sales

### Shipments (`/api/shipments`)

Permission: `shipment:read` / `shipment:write` / `shipment:intervene`

| Method | Path | Key fields |
|---|---|---|
| GET | `/api/shipments` | Query: `carrierId`, `status`, `page` |
| GET | `/api/shipments/:id` | Includes parcels |
| POST | `/api/shipments` | `fulfillmentId`, `carrierId`, `warehouseId`, `trackingNumber` |
| PATCH | `/api/shipments/:id/status` | `status` (manual override) |
| POST | `/api/shipments/sync/:carrierId` | Triggers immediate carrier sync for a carrier |

### Parcels (`/api/parcels`)

Permission: `shipment:read` / `shipment:write`

| Method | Path | Key fields |
|---|---|---|
| GET | `/api/parcels` | Query: `shipmentId`, `status` |
| GET | `/api/parcels/:id` | Includes carrier timeline JSON |
| POST | `/api/parcels` | `shipmentId`, `description`, `weightKg` |
| PATCH | `/api/parcels/:id/status` | `status` |

**Parcel statuses:** `pending`, `in_transit`, `out_for_delivery`, `delivered`, `exception`

### After-Sales Tickets (`/api/after-sales`)

Permission: `after-sales:read` / `after-sales:create` / `after-sales:manage`

| Method | Path | Key fields / notes |
|---|---|---|
| GET | `/api/after-sales` | Query: `studentId`, `type`, `status`, `slaAtRisk`, `page` |
| GET | `/api/after-sales/:id` | Includes evidence files and compensations |
| POST | `/api/after-sales` | `studentId`, `shipmentId`, `type` (`delay`/`dispute`/`lost_item`), `description`; auto-suggests compensation on `delay` type |
| PATCH | `/api/after-sales/:id/status` | `status` (`open`/`in_progress`/`resolved`/`closed`) |

**Evidence:**

| Method | Path | Notes |
|---|---|---|
| POST | `/api/after-sales/:id/evidence/image` | Multipart `file` field; JPEG/PNG; max 10MB; aHash dedup |
| POST | `/api/after-sales/:id/evidence/text` | `{ note: string }` |

**Compensations:**

| Method | Path | Permission | Key fields |
|---|---|---|---|
| GET | `/api/after-sales/:id/compensations` | `after-sales:read` | List compensations |
| POST | `/api/after-sales/:id/compensations/suggest` | `compensation:suggest` | `amount`, `reason`; auto-calculated from `CompensationRule` |
| PATCH | `/api/after-sales/:id/compensations/:cid/approve` | `compensation:approve-limited` | `approvalNote`; limited = up to $25 for CS agents, up to cap for ops managers |
| PATCH | `/api/after-sales/:id/compensations/:cid/reject` | `compensation:approve-limited` | `rejectNote` |

Approved credit compensations call `storedValueService.topUp()` within the same approval flow.

---

## 10. Observability

### Metrics (`/api/metrics`)

Permission: `metrics:read`

| Method | Path | Response |
|---|---|---|
| GET | `/api/metrics` | Latest snapshot for each metric name: `[{ metricName, value, recordedAt }]` |
| GET | `/api/metrics/:name/history` | Time-series array; query: `from`, `to`, `limit` |

**Metric names:** `cpu_utilization_percent`, `memory_used_mb`, `memory_free_mb`, `active_jobs`, `open_parking_alerts`, `open_after_sales_tickets`

### Alert History (`/api/alerts`)

Permission: `alerts:read` / `alerts:manage`

| Method | Path | Notes |
|---|---|---|
| GET | `/api/alerts` | Query: `acknowledged`, `metricName`, `from`, `to`, `page` |
| PATCH | `/api/alerts/:id/acknowledge` | Sets `acknowledgedAt` |

### Thresholds (`/api/thresholds`)

Permission: `alerts:read` (GET) / `alerts:manage` (write)

| Method | Path | Key fields |
|---|---|---|
| GET | `/api/thresholds` | All thresholds |
| GET | `/api/thresholds/:id` | Single threshold |
| POST | `/api/thresholds` | `metricName`, `operator` (`gt`/`lt`/`gte`/`lte`), `threshold`, `isActive` |
| PUT | `/api/thresholds/:id` | Any threshold fields |
| DELETE | `/api/thresholds/:id` | Hard delete |

### Logs (`/api/logs`)

Permission: `logs:read`

| Method | Path | Query params |
|---|---|---|
| GET | `/api/logs` | `date` (YYYY-MM-DD), `level` (`error`/`warn`/`info`/`debug`), `query` (text search), `from`, `to`, `page`, `limit` |

Response: `{ entries: LogEntry[], total, page, limit }`

### Backups (`/api/backups`)

Permission: `backup:read` / `backup:manage`

| Method | Path | Notes |
|---|---|---|
| GET | `/api/backups` | Query: `status`, `page`, `limit` |
| GET | `/api/backups/:id` | Single backup record |
| POST | `/api/backups` | Trigger immediate backup; returns `BackupRecord` |
| POST | `/api/backups/:id/verify` | Validates manifest file; returns `{ passed, details }` |

**BackupRecord fields:** `id`, `fileName`, `filePath`, `status` (`running`/`completed`/`failed`), `verifyStatus` (`pending`/`passed`/`failed`), `startedAt`, `finishedAt`, `errorMsg`
