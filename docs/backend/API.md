<!--
DOCUMENT METADATA
Owner: @backend-developer
Update trigger: Any API endpoint is added, modified, or removed
Update scope: Full document
Read by: @frontend-developer (to know what endpoints to call and their contracts),
          @qa-engineer (for API contract testing)
-->

# API Reference

> **Base URL**: `http://localhost:3000/api/v1` (local) · interactive Swagger UI at `http://localhost:3000/api/docs`
> **Authentication**: `Authorization: Bearer <accessToken>` (no cookies, so no CSRF surface)
> **Content-Type**: `application/json` for all requests and responses
> **Response format**: one envelope for success, lists and errors (see "Response format" below)
> **Language**: all `message` values are Vietnamese; `code` values are stable and machine-readable
> **Last updated**: 2026-10-02 (typed OpenAPI contract; response views aligned with the generated schemas)

> **Contract sources.** This file is the prose reference. The machine-readable contract is [`openapi.json`](openapi.json) (generated from the code, **the source of truth** for field names, types, enums, required/optional, roles and per-endpoint error codes) and its TypeScript form [`api-types.ts`](api-types.ts). Frontend developers: start with the Vietnamese [integration guide](api_integration_guide.md) (conventions, auth flow, business flows, error catalogue). Where this file and `openapi.json` ever differ, `openapi.json` wins (it is verified against real responses by `test/openapi-contract.e2e-spec.ts`); please fix this file. Regenerate with `npm run openapi:export`; `npm run openapi:check` fails when the committed files are stale.
>
> Response type names used below (`ProductResponse`, `SaleDetailResponse`, ...) are the schema names in `openapi.json` / `api-types.ts` (`components['schemas']['ProductResponse']`); request bodies and query objects are the `*Dto` schemas.

---

## Conventions

### Authentication

`POST /auth/login` returns a short-lived JWT access token (15 minutes by default) and an opaque refresh token. Send the access token as `Authorization: Bearer ...`. On every request the server also checks that the session is not revoked and the user is still active, so logout and locking a user take effect immediately. When the access token expires, call `POST /auth/refresh`; the refresh token is rotated on each use.

### Sessions and refresh tokens

- A refresh token is single-use: `POST /auth/refresh` returns a new one and the old one stops working.
- **Reuse detection**: presenting a refresh token that was already rotated (a stale client, or a stolen copy) answers `401 INVALID_REFRESH_TOKEN` **and revokes that whole session**. The newest refresh token and the session's access token stop working immediately, so the user has to log in again. Only the immediately previous token is recognised; older or unknown tokens just answer `401` without side effects.
- Expired or revoked sessions are deleted by a daily server job once they are older than `SESSION_RETENTION_DAYS` (default 30); this is invisible to clients.
- Clients should therefore never retry a refresh with an old token; if a refresh call fails with `401`, send the user to the login screen.

### Roles

`ADMIN`, `CASHIER`, `STOCKKEEPER`. The "Roles" line of each endpoint lists who may call it; everyone else gets `403 FORBIDDEN` (and the denial is logged). Routes are deny-by-default. The matrix lives in `src/common/permissions/permissions.ts`.

### Response format

Every response from every endpoint, including lists, errors and `GET /health`, uses one envelope. Real HTTP status codes are kept (201 on create, 4xx/5xx on errors); the envelope repeats the status in `statusCode`. Swagger UI and `/api/docs-json` are not wrapped. In the per-endpoint sections below, every **Response** block is labelled "`data` field of the envelope": it shows only the value of `data` (for lists, the items; `meta` carries the pagination), never the whole envelope. `success`, `statusCode`, `code`, `message`, `requestId` and `timestamp` are always present around it.

**Success**

```json
{
  "success": true,
  "statusCode": 201,
  "code": "OK",
  "message": "Tạo hóa đơn thành công",
  "data": { "id": 1, "invoiceNo": "HD202610020001", "total": 36000 },
  "requestId": "6859fec4-4a9a-4af0-bf53-c9f03c774f0b",
  "timestamp": "2026-10-02T04:50:53.609Z"
}
```

**List** (`data` is the array of items; pagination is a top-level `meta`)

```json
{
  "success": true, "statusCode": 200, "code": "OK", "message": "Thành công",
  "data": [ { "id": 16, "sku": "BANH-OREO" } ],
  "meta": { "page": 1, "pageSize": 20, "total": 12 },
  "requestId": "...", "timestamp": "..."
}
```

**Error**

```json
{
  "success": false,
  "statusCode": 409,
  "code": "INSUFFICIENT_STOCK",
  "message": "Không đủ tồn kho cho một số sản phẩm. Vui lòng giảm số lượng hoặc cập nhật giỏ hàng.",
  "data": null,
  "details": [ { "productId": 14, "sku": "COCA-330", "name": "...", "requested": 9999, "available": 93 } ],
  "requestId": "900b9399-48f0-4a32-8a3e-c44fdd4c3416",
  "timestamp": "2026-10-02T06:15:02.942Z"
}
```

- `code` is `OK` on success and a stable machine-readable value on errors; `message` is Vietnamese (the default success message is `Thành công`; main write endpoints have specific ones, e.g. `Đăng nhập thành công`, `Tạo hóa đơn thành công`, `Xác nhận nhận hàng thành công`).
- `details` appears on errors only when useful (field errors, stock availability, ...). Validation errors use `details: [{ "field": "items.0.quantity", "messages": ["Số lượng phải lớn hơn hoặc bằng 1"] }]`; all validation messages are Vietnamese.
- `meta` appears only on list endpoints. (`GET /reports/inventory` returns its product page inside `data.products` as `{ items, meta }`.)
- `requestId` echoes a valid `X-Request-Id` request header (1-64 chars of `A-Za-z0-9._-`), otherwise it is generated; quote it when reporting problems. It is only returned in the envelope body: the server does **not** send an `X-Request-Id` response header. Every server log line of the request carries this id; server errors (5xx) are logged with the stack trace, business errors (409/422 and other domain errors) as warnings with `code` and route, and the stack is never returned.
- Operations that used to answer `204 No Content` (`POST /auth/logout`, `POST /users/:id/reset-password`) now answer `200` with `data: null`, because an enveloped body needs content.

### Error codes

| HTTP | `code` | When |
|------|--------|------|
| 400 | `VALIDATION_ERROR` | Invalid body/query/params, unknown properties, Prisma validation error. Malformed JSON: message `Nội dung JSON không hợp lệ.`; empty body with a JSON content type: `Nội dung yêu cầu không được để trống.` (neither has `details`) |
| 400 | `INVALID_DATE_RANGE` | A date that does not exist (e.g. `2026-02-31`), `to < from`, or - for `/reports/*` only - a range over 366 days (list filters have no maximum range and accept `from` or `to` alone) |
| 401 | `UNAUTHENTICATED` | Missing/invalid/expired token, revoked session, locked user |
| 401 | `INVALID_CREDENTIALS` | Wrong username or password (one generic message) |
| 401 | `INVALID_REFRESH_TOKEN` | Refresh token unknown, rotated away, expired or session revoked. Presenting a token that was already rotated also revokes the whole session (reuse detection) |
| 403 | `FORBIDDEN` | Role not allowed (denial is logged) |
| 403 | `ACCOUNT_LOCKED` | Correct password but the account is locked/inactive |
| 404 | `NOT_FOUND` | Unknown route or resource |
| 404 | `USER_NOT_FOUND`, `CATEGORY_NOT_FOUND`, `PRODUCT_NOT_FOUND`, `SUPPLIER_NOT_FOUND`, `CUSTOMER_NOT_FOUND`, `SALE_NOT_FOUND`, `PURCHASE_NOT_FOUND` | The record addressed by the URL (or `customerId` at checkout, `code`/`q` lookups) does not exist |
| 409 | `INSUFFICIENT_STOCK` | Checkout quantity above current stock; `details` lists availability per product |
| 409 | `STOCK_CONFLICT` | Stock changed since the count form was read; `details: { productId, expectedSystemQty, currentStockQty }` |
| 409 | `PURCHASE_ALREADY_RECEIVED`, `PURCHASE_CANCELLED` | Purchase is not a DRAFT any more |
| 409 | `DUPLICATE_VALUE` | Unique constraint (username, SKU, barcode, phone, category name); `details.fields` is the MySQL unique-index name, e.g. `products_sku_key` |
| 409 | `RESOURCE_IN_USE` | Foreign-key reference blocks the operation |
| 409 | `CANNOT_LOCK_SELF`, `LAST_ACTIVE_ADMIN` | User-management safeguards |
| 409 | `TRANSACTION_CONFLICT` | Deadlock / lock wait timeout persisted after 3 automatic attempts; retry the request |
| 413 | `PAYLOAD_TOO_LARGE` | Request body over the 1 MB limit |
| 415 | `UNSUPPORTED_MEDIA_TYPE` | Body is not `application/json` |
| 422 | `INVALID_QUANTITY`, `INVALID_DISCOUNT`, `INVALID_PAYMENT`, `INVALID_PURCHASE_LINE` | Business-rule violation on a well-formed body |
| 422 | `PRODUCT_UNAVAILABLE`, `SUPPLIER_INACTIVE`, `SUPPLIER_NOT_FOUND`, `CATEGORY_INACTIVE`, `CATEGORY_NOT_FOUND` (referenced from inside a body) | Referenced record unknown or inactive. (`CUSTOMER_NOT_FOUND` at checkout is a `404`, not a `422`.) |
| 422 | `CONSTRAINT_VIOLATION` | A database CHECK constraint rejected the data (e.g. negative stock) |
| 429 | `TOO_MANY_REQUESTS` | Rate limit hit (login is much stricter) |
| 500 | `INTERNAL_ERROR` | Unexpected error; details only in the server log |
| 503 | `SERVICE_UNAVAILABLE` | Database unreachable / connection dropped / pool exhausted (UC-01 E4, UC-05 E4) |
| 503 | `TRANSACTION_TIMEOUT` | An interactive transaction exceeded its timeout and was rolled back; safe to retry |

Request bodies reject unknown properties (`400 VALIDATION_ERROR`), which is how read-only fields such as `stockQty` and `costPrice` are protected.

### Pagination

List endpoints accept `page` (default 1) and `pageSize` (default 20, max 100). In the envelope, `data` is the array of items and `meta` is `{ "page": 1, "pageSize": 20, "total": 134 }` (see the List example above).

### Numbers and dates

- Money (VND) and quantities are JSON **numbers** (`type: number` in the schemas; ids, counts, `page`, `pageSize`, `pointsEarned`, `loyaltyPoints` are `integer`). They are stored and computed as `DECIMAL`, never floats. Money has at most 2 decimals; v1 quantities are whole numbers (BR4), enforced by the service.
- Timestamps are ISO-8601 UTC strings (`2026-10-02T04:50:53.609Z`).
- Date parameters (`from`, `to`) are calendar dates `YYYY-MM-DD` interpreted in `Asia/Ho_Chi_Minh`; `to` is inclusive. Reports require both and cap the range at 366 days; list filters (`/sales`, `/purchases`, `/inventory/movements`, `/inventory/stock-counts`) accept either bound alone.

### Document numbers

| Document | Format | Example |
|----------|--------|---------|
| Invoice | `HD` + yyyyMMdd (store day) + 4-digit daily sequence | `HD202610020001` |
| Purchase | `PN` + yyyyMMdd + 4-digit daily sequence | `PN202610020001` |
| Stock count | `KK` + yyyyMMdd + 4-digit daily sequence | `KK202610020001` |
| Customer code | `KH` + 6-digit global sequence | `KH000001` |

---

## Health

#### GET /health

**Auth required**: No · **Roles**: public
**Description**: Liveness plus a `SELECT 1` against the database.

**Response 200 — `data` field of the envelope** (`HealthResponse`): `{ "status": "ok", "database": "up" }`
**Error codes**: `503 SERVICE_UNAVAILABLE` database unreachable.

---

## Auth

#### POST /auth/login

**Auth required**: No · **Roles**: public · **Rate limit**: `LOGIN_THROTTLE_LIMIT` per `LOGIN_THROTTLE_TTL_SECONDS` per IP (default 5/60s)
**Description**: Verifies username + password and opens a session.

**Request body**:
```json
{ "username": "string — required, case-insensitive", "password": "string — required" }
```

**Response 200 — `data` field of the envelope** (`AuthTokensResponse`):
```json
{
  "tokenType": "Bearer",
  "accessToken": "string — JWT, carries the session id",
  "expiresIn": 900,
  "refreshToken": "string — opaque; only its SHA-256 hash is stored",
  "refreshExpiresAt": "ISO date",
  "user": { "id": 2, "username": "cashier", "fullName": "string", "role": "CASHIER" }
}
```

**Error codes**:
- `400` — missing username or password (`VALIDATION_ERROR`, field-level details)
- `401` — `INVALID_CREDENTIALS`: one generic message whether the username or the password was wrong
- `403` — `ACCOUNT_LOCKED`: returned **only after the password verified**, so it does not reveal which accounts exist
- `429` — too many attempts

#### POST /auth/refresh

**Auth required**: No · **Roles**: public
**Description**: Rotates the refresh token (the old one stops working) and returns a new access token for the same session. Replaying an already-rotated token revokes the session (see "Sessions and refresh tokens").

**Request body**: `{ "refreshToken": "string" }`
**Response 200 — `data` field of the envelope**: same shape as login.
**Error codes**: `401` — `INVALID_REFRESH_TOKEN` (unknown, rotated-away, expired, revoked session, or user locked).

#### POST /auth/logout

**Auth required**: Yes · **Roles**: any authenticated role
**Description**: Revokes the current session. The access token is rejected immediately afterwards.
**Response 200 — `data` field of the envelope**: `data: null`.

#### GET /auth/me

**Auth required**: Yes · **Roles**: any authenticated role
**Response 200 — `data` field of the envelope** (`SessionUserResponse`): `{ "id", "username", "fullName", "role" }`

---

## Users

All user endpoints: **Roles: ADMIN**. Responses never include the password hash.

User view (`UserResponse`): `{ id, username, fullName, role, isActive, createdAt, updatedAt }`.

#### GET /users

**Query**: `search` (username or full name), `role`, `isActive`, `page`, `pageSize`.
**Response 200 — `data` field of the envelope**: paginated list of user views.

#### GET /users/:id

**Response 200 — `data` field of the envelope**: user view. **Errors**: `404 USER_NOT_FOUND`.

#### POST /users

**Request body**:
```json
{
  "username": "3-50 chars [a-zA-Z0-9._-], stored lower-case, unique",
  "password": "8-128 chars",
  "fullName": "string, required",
  "role": "ADMIN | CASHIER | STOCKKEEPER"
}
```
**Response 201 — `data` field of the envelope**: user view. **Errors**: `400` validation, `409 DUPLICATE_VALUE` (username taken).

#### PATCH /users/:id

**Request body** (all optional): `{ "fullName": "string", "role": "ADMIN | CASHIER | STOCKKEEPER" }`
**Response 200 — `data` field of the envelope**: user view.
**Errors**: `404`, `409 LAST_ACTIVE_ADMIN` (cannot demote the last active admin).

#### POST /users/:id/lock

**Description**: Sets `isActive=false` and revokes all of the user's sessions at once. No delete endpoint exists (F2/BR10).
**Response 200 — `data` field of the envelope**: user view.
**Errors**: `404`, `409 CANNOT_LOCK_SELF`, `409 LAST_ACTIVE_ADMIN`.

#### POST /users/:id/unlock

**Response 200 — `data` field of the envelope**: user view. **Errors**: `404`.

#### POST /users/:id/reset-password

**Request body**: `{ "newPassword": "8-128 chars" }`
**Description**: Replaces the password and revokes all of the user's sessions.
**Response 200 — `data` field of the envelope**: `data: null`. **Errors**: `400`, `404`.

---

## Categories

Category (`CategoryResponse`): `{ id, name, description (string | null), isActive, createdAt, updatedAt }`. Names are unique and non-blank.

| Endpoint | Roles | Notes |
|----------|-------|-------|
| `GET /categories` | all | Query: `search` (name), `isActive`, `page`, `pageSize` |
| `GET /categories/:id` | all | `404 CATEGORY_NOT_FOUND` |
| `POST /categories` | ADMIN, STOCKKEEPER | Body `{ name (required, <=120), description? }`; `201`; `409 DUPLICATE_VALUE` |
| `PATCH /categories/:id` | ADMIN, STOCKKEEPER | Body `{ name?, description? (null clears) }` |
| `POST /categories/:id/deactivate` | ADMIN, STOCKKEEPER | `200`, returns the category (no hard delete) |
| `POST /categories/:id/activate` | ADMIN, STOCKKEEPER | `200` |

---

## Products

Product view (`ProductResponse`):

```json
{
  "id": 14, "categoryId": 7, "category": { "id": 7, "name": "Đồ uống" },
  "sku": "COCA-330", "barcode": "8934588063017", "name": "Coca-Cola lon 330ml", "unit": "lon",
  "salePrice": 10000, "costPrice": 7500, "stockQty": 96, "reorderLevel": 24,
  "isActive": true, "createdAt": "...", "updatedAt": "..."
}
```

`costPrice` is **omitted for CASHIER** (the key is absent, not `null`; it is optional in the schema, `costPrice?: number`). `stockQty` and `costPrice` are read-only through the API: stock changes only through purchases, sales and stock counts; cost changes only by receiving purchases (BR11), apart from an optional opening cost on create.

#### GET /products

**Roles**: ADMIN, CASHIER, STOCKKEEPER
**Query**: `search` (name, SKU or barcode), `categoryId`, `isActive`, `page`, `pageSize`.
**Response 200 — `data` field of the envelope**: paginated product views, ordered by name.

#### GET /products/lookup

**Roles**: ADMIN, CASHIER, STOCKKEEPER
**Description**: POS scan. Exact barcode or SKU match, **active products only**.
**Query**: `code` (required).
**Response 200 — `data` field of the envelope**: product view. **Errors**: `404 PRODUCT_NOT_FOUND` (not found or inactive, UC-02 E1).

#### GET /products/:id

**Roles**: all. **Errors**: `404 PRODUCT_NOT_FOUND`.

#### POST /products

**Roles**: ADMIN, STOCKKEEPER
**Request body**:
```json
{
  "categoryId": "number — must exist and be active",
  "sku": "string 1-50 [A-Za-z0-9._-/], unique",
  "barcode": "string, optional, unique when present",
  "name": "string, required",
  "unit": "string, required",
  "salePrice": "number >= 0, max 2 decimals",
  "costPrice": "number >= 0, optional opening cost (default 0)",
  "reorderLevel": "integer >= 0, optional (default 0)"
}
```
**Response 201 — `data` field of the envelope**: product view with `stockQty: 0`.
**Errors**: `400` (incl. unknown fields such as `stockQty`), `409 DUPLICATE_VALUE` (sku/barcode), `422 CATEGORY_NOT_FOUND | CATEGORY_INACTIVE`.

#### PATCH /products/:id

**Roles**: ADMIN, STOCKKEEPER
**Request body** (all optional): `categoryId`, `sku`, `barcode` (null clears), `name`, `unit`, `salePrice`, `reorderLevel`. Sending `stockQty` or `costPrice` is a `400`.
**Response 200 — `data` field of the envelope**: product view. **Errors**: `404`, `409`, `422`.

#### POST /products/:id/deactivate · POST /products/:id/activate

**Roles**: ADMIN, STOCKKEEPER · **Response 200 — `data` field of the envelope**: product view. Inactive products cannot be sold or received.

---

## Suppliers

**Roles (all endpoints)**: ADMIN, STOCKKEEPER. Supplier (`SupplierResponse`): `{ id, name, phone, email, address, note (each string | null), isActive, createdAt, updatedAt }`.

| Endpoint | Notes |
|----------|-------|
| `GET /suppliers` | Query: `search` (name, phone, email), `isActive`, `page`, `pageSize` |
| `GET /suppliers/:id` | `404 SUPPLIER_NOT_FOUND` |
| `POST /suppliers` | Body `{ name (required), phone?, email?, address?, note? }`; `201` |
| `PATCH /suppliers/:id` | Same fields, all optional (null clears optional ones) |
| `POST /suppliers/:id/deactivate` / `activate` | `200`, returns the supplier (no hard delete) |

---

## Customers

**Roles (all endpoints)**: ADMIN, CASHIER. Customer (`CustomerResponse`): `{ id, customerCode, fullName, phone (string | null), email (string | null), loyaltyPoints, createdAt, updatedAt }`.

Phone numbers are normalised (`+84901234567`, `0901 234 567` -> `0901234567`) and must be 10-11 digits starting with 0. A phone is unique when present.

#### GET /customers

**Query**: `search` (name, code or phone), `page`, `pageSize`. **Response 200 — `data` field of the envelope**: paginated customers (newest first).

#### GET /customers/lookup

**Query**: `q` (required) — customer code or exact phone. **Response 200 — `data` field of the envelope**: customer. **Errors**: `404 CUSTOMER_NOT_FOUND` (the POS may continue without a customer or create one; the server never guesses).

#### GET /customers/:id

**Errors**: `404 CUSTOMER_NOT_FOUND`.

#### POST /customers

**Request body**: `{ "fullName": "required", "phone": "optional", "email": "optional" }` — `customerCode` (`KH000001`) is generated.
**Response 201 — `data` field of the envelope**: customer. **Errors**: `400` invalid phone/email, `409 DUPLICATE_VALUE` (phone).

#### PATCH /customers/:id

**Request body** (all optional): `fullName`, `phone` (null clears), `email` (null clears). Points cannot be edited.

---

## Purchases

**Roles (all endpoints)**: ADMIN, STOCKKEEPER.

Purchase detail (`PurchaseDetailResponse`): `{ id, purchaseNo, supplierId, supplier:{id,name}, createdBy, creator:{id,fullName}, status (DRAFT|RECEIVED|CANCELLED), subtotal, total, note (string | null), receivedAt (ISO | null), receivedBy (user id | null), createdAt, updatedAt, items:[{ id, purchaseId, productId, product:{id,sku,name,unit}, quantity, unitCost, lineTotal }] }`. The list item (`PurchaseListItemResponse`) is the same without `items`. There is no `receiver` object: only the id `receivedBy` is returned. Totals are computed server-side (`subtotal = total = sum of line totals`).

Line rules (UC-03 E2): at least one line, one line per product, `quantity` a whole number > 0, `unitCost` >= 0 with at most 2 decimals.

#### GET /purchases

**Query**: `search` (purchase number), `status`, `supplierId`, `from`, `to` (creation date), `page`, `pageSize`.
**Response 200 — `data` field of the envelope**: paginated list (supplier and creator summaries, no lines).

#### GET /purchases/:id

**Errors**: `404 PURCHASE_NOT_FOUND`.

#### POST /purchases

**Request body**:
```json
{
  "supplierId": "number — must exist and be active",
  "note": "string, optional",
  "items": [ { "productId": 1, "quantity": 10, "unitCost": 1200 } ],
  "receiveNow": "boolean, optional — create and receive in one transaction"
}
```
**Response 201 — `data` field of the envelope**: purchase detail (`DRAFT`, or `RECEIVED` with `receiveNow`). Stock is untouched while `DRAFT`.
**Errors**: `400`, `422 SUPPLIER_NOT_FOUND | SUPPLIER_INACTIVE | PRODUCT_UNAVAILABLE | INVALID_PURCHASE_LINE | INVALID_QUANTITY`.

#### PATCH /purchases/:id

**Description**: Edit a `DRAFT`: `supplierId?`, `note?` (null clears), `items?` (when present, replaces all lines).
**Response 200 — `data` field of the envelope**: purchase detail.
**Errors**: `404`, `409 PURCHASE_ALREADY_RECEIVED | PURCHASE_CANCELLED`, `422` as for create.

#### POST /purchases/:id/receive

**Description**: DRAFT -> RECEIVED in one transaction. Locks the purchase row and re-checks the status, checks that the supplier and all products are active, locks products in id order, then for each line: `stock += quantity`, `cost = round2((oldQty*oldCost + qty*unitCost) / (oldQty + qty))` (or `unitCost` when `oldQty = 0`), writes a `PURCHASE` movement; sets `receivedAt`/`receivedBy`.
**Response 200 — `data` field of the envelope**: purchase detail.
**Errors**: `404`, `409 PURCHASE_ALREADY_RECEIVED` (also when two requests race: one wins), `409 PURCHASE_CANCELLED`, `422 SUPPLIER_INACTIVE | PRODUCT_UNAVAILABLE` (everything rolled back).

#### POST /purchases/:id/cancel

**Description**: DRAFT -> CANCELLED. Purchases are never deleted.
**Response 200 — `data` field of the envelope**: purchase detail. **Errors**: `404`, `409 PURCHASE_ALREADY_RECEIVED | PURCHASE_CANCELLED`.

---

## Sales (POS)

Sale detail (`SaleDetailResponse`):

```json
{
  "id": 1, "invoiceNo": "HD202610020001", "customerId": 1, "cashierId": 2, "status": "PAID",
  "subtotal": 40000, "discountAmount": 4000, "total": 36000, "pointsEarned": 3, "note": null,
  "soldAt": "...", "createdAt": "...", "updatedAt": "...",
  "items": [ { "id": 1, "saleId": 1, "productId": 13, "skuSnapshot": "...", "nameSnapshot": "...", "quantity": 2,
               "unitPrice": 5000, "unitCostSnapshot": 3500, "discountAmount": 1000, "lineTotal": 9000 } ],
  "payments": [ { "id": 1, "saleId": 1, "method": "CASH", "amount": 36000, "tenderedAmount": 50000,
                  "changeAmount": 14000, "paidAt": "...", "reference": null } ],
  "customer": { "id": 1, "customerCode": "KH000001", "fullName": "...", "phone": "...", "loyaltyPoints": 3 },
  "cashier": { "id": 2, "fullName": "..." }
}
```

`unitCostSnapshot` (unit cost at the time of sale) is returned to every role that can read sales, including CASHIER. It is internal information: clients must not display it to cashiers. (Open item: hiding it per role would be a contract change.)

#### POST /sales

**Roles**: ADMIN, CASHIER
**Description**: POS checkout in a single database transaction. Products are locked (`SELECT ... FOR UPDATE`, ordered by id). Price and cost are snapshotted per line from the current product. Any failure rolls back everything (stock, sale, movements, points).

**Request body**:
```json
{
  "customerId": "number, optional — adds loyalty points",
  "items": [ { "productId": 1, "quantity": 3 } ],
  "discountAmount": "integer VND >= 0, optional (default 0)",
  "payments": [ { "method": "CASH | CARD | TRANSFER | OTHER", "amount": 36000, "tenderedAmount": 50000, "reference": "optional" } ],
  "note": "string, optional"
}
```

Rules:
- `items`: 1-200 lines; `quantity` a whole number >= 1. Repeated products are merged.
- Discount (BR7): `0 <= discountAmount < subtotal` and at most `MAX_DISCOUNT_PERCENT_CASHIER`% (CASHIER, default 10) or `MAX_DISCOUNT_PERCENT_ADMIN`% (ADMIN, default 100) of the subtotal. It is allocated to lines proportionally, rounded to whole VND, the last line taking the remainder, so line discounts sum exactly. `lineTotal = quantity * unitPrice - line discount`.
- Payments: 1-10 entries whose `amount`s sum **exactly** to the total. CASH: `tenderedAmount >= amount` (default = amount), `changeAmount = tendered - amount`. Other methods: tendered = amount, change = 0.
- Points (BR6): `floor(total / POINTS_PER_VND)` (default 10000), only with a customer.

**Response 201 — `data` field of the envelope**: sale detail (`SaleDetailResponse`).
**Error codes**:
- `400` — validation (empty cart, quantity 0/negative/fractional, ...)
- `404` — `CUSTOMER_NOT_FOUND`
- `409` — `INSUFFICIENT_STOCK`, `details: [{ productId, sku, name, requested, available }]` for each short product (UC-02 E2/E3)
- `422` — `PRODUCT_UNAVAILABLE` (unknown or inactive, `details: [{ productId, reason: INACTIVE | NOT_FOUND }]`), `INVALID_DISCOUNT` (`details: { subtotal }` when discount >= subtotal, or `{ maxDiscountPercent, maxDiscountAmount }` above the role limit), `INVALID_PAYMENT` (`details: { total, paid }` when the payments do not add up), `INVALID_QUANTITY`
- `409 TRANSACTION_CONFLICT`, `503 TRANSACTION_TIMEOUT` — nothing was written; safe to retry. There is no idempotency key: a request that got no response at all may or may not have created the invoice (check `GET /sales` before retrying).

#### GET /sales

**Roles**: ADMIN, CASHIER (a cashier sees all sales)
**Query** (all optional, combined with AND):

| Param | Meaning |
|-------|---------|
| `search` | Partial match on the invoice number |
| `customerId` | Exact customer id |
| `customerQuery` | Partial match on the customer's **phone or customer code** (max 30 chars). The phone part is normalised like other phone inputs, so `+84 912 345 678`, `84912345678` and `912345678` all find `0912345678`; a code fragment such as `KH0001` matches `KH000123` (case-insensitive). Sales without a customer never match. |
| `paymentMethod` | `CASH`, `CARD`, `TRANSFER` or `OTHER`: only sales with at least one payment of that method (a split payment matches each of its methods). Any other value answers `400 VALIDATION_ERROR` |
| `cashierId` | Exact cashier id |
| `from`, `to` | `YYYY-MM-DD` store-day range, `to` inclusive |
| `page`, `pageSize` | Pagination |

Example: `GET /sales?customerQuery=0987&paymentMethod=TRANSFER&from=2026-10-01`.
**Response 200 — `data` field of the envelope**: paginated `SaleListItemResponse` (newest first): the sale columns (`id, invoiceNo, customerId, cashierId, status, subtotal, discountAmount, total, pointsEarned, note, soldAt, createdAt, updatedAt`) plus `customer: { id, customerCode, fullName } | null`, `cashier: { id, fullName }` and `payments: [{ method, amount }]` (no `items`).

#### GET /sales/:id

**Roles**: ADMIN, CASHIER. **Response 200 — `data` field of the envelope**: sale detail. **Errors**: `404 SALE_NOT_FOUND`.

#### GET /sales/:id/print

(Response type `ReceiptResponse`.)

**Roles**: ADMIN, CASHIER
**Description**: Print-friendly receipt payload. Read-only: reprinting never creates a sale (UC-02 E7).
**Response 200 — `data` field of the envelope**:
```json
{
  "store": { "name": "from STORE_NAME", "address": "STORE_ADDRESS", "phone": "STORE_PHONE" },
  "invoiceNo": "...", "soldAt": "...",
  "cashier": { "id": 2, "fullName": "..." },
  "customer": { "id": 1, "customerCode": "...", "fullName": "...", "phone": "..." },
  "items": [ { "sku": "...", "name": "...", "quantity": 2, "unitPrice": 5000, "discountAmount": 1000, "lineTotal": 9000 } ],
  "subtotal": 40000, "discountAmount": 4000, "total": 36000,
  "payments": [ { "method": "CASH", "amount": 36000, "tenderedAmount": 50000, "changeAmount": 14000, "reference": null } ],
  "pointsEarned": 3, "customerPointsBalance": 3
}
```
`customer` and `customerPointsBalance` are `null` when no customer was attached. **Errors**: `404 SALE_NOT_FOUND`.

---

## Inventory

#### GET /inventory/stock

**Roles**: ADMIN, CASHIER, STOCKKEEPER (cashiers: current stock only; no cost data is returned here)
**Query**: `search` (name, SKU, barcode), `categoryId`, `lowStock=true` (stock <= reorder level), `isActive` (default `true`), `page`, `pageSize`.
**Response 200 — `data` field of the envelope**: paginated `StockItemResponse`: `{ productId, sku, barcode (string | null), name, unit, categoryId, categoryName, stockQty, reorderLevel, isLowStock, isActive }`.

#### GET /inventory/low-stock

**Roles**: ADMIN, STOCKKEEPER
**Query**: `search`, `categoryId`, `page`, `pageSize`. **Response 200 — `data` field of the envelope**: same item shape, active products with `stockQty <= reorderLevel`.

#### GET /inventory/movements

**Roles**: ADMIN, STOCKKEEPER
**Query**: `productId`, `type` (`PURCHASE | SALE | ADJUSTMENT | REVERSAL`), `from`, `to`, `page`, `pageSize`.
**Response 200 — `data` field of the envelope**: paginated `MovementResponse` (newest first): `{ id, productId, product:{id,sku,name,unit}, movementType, quantityChange (signed), referenceType, referenceId, createdBy, creator:{id,fullName}, note (string | null), createdAt }`.

#### GET /inventory/stock-counts

**Roles**: ADMIN, STOCKKEEPER
**Query**: `productId`, `from`, `to`, `page`, `pageSize`.
**Response 200 — `data` field of the envelope**: paginated `StockCountResponse`: `{ id, countNo, productId, product:{id,sku,name,unit}, systemQty, countedQty, difference, reason, createdBy, creator:{id,fullName}, createdAt }`.

#### POST /inventory/stock-counts

**Roles**: ADMIN, STOCKKEEPER
**Description**: Record a physical count (UC-04). In one transaction: lock the product; if the current stock differs from `expectedSystemQty` -> `409 STOCK_CONFLICT`; otherwise insert the count, insert an `ADJUSTMENT` movement with the signed difference (skipped when the difference is 0, the count is still recorded) and set the stock to `countedQty`. Cost is not changed (BR11).

**Request body**:
```json
{
  "productId": 1,
  "countedQty": "whole number >= 0",
  "reason": "string, required, <= 500",
  "expectedSystemQty": "the stock the user saw"
}
```
**Response 201 — `data` field of the envelope** (`StockCountResultResponse`):
```json
{
  "stockCount": { "id": 1, "countNo": "KK202610020001", "productId": 1, "systemQty": 10, "countedQty": 7, "difference": -3, "reason": "...", "createdBy": 3, "createdAt": "...", "creator": { "id": 3, "fullName": "..." }, "product": { "id": 1, "sku": "...", "name": "...", "unit": "..." } },
  "product": { "id": 1, "sku": "...", "name": "...", "unit": "...", "stockQty": 7 }
}
```
**Error codes**: `400` (negative count, missing/blank reason), `404 PRODUCT_NOT_FOUND`, `409 STOCK_CONFLICT` with `details: { productId, expectedSystemQty, currentStockQty }`, `422 INVALID_QUANTITY` (fractional).

---

## Reports

Response types: `RevenueReportResponse`, `TopProductsReportResponse`, `GrossProfitReportResponse`, `InventoryReportResponse`. All reports require `from` and `to` (`YYYY-MM-DD`, store time, `to` inclusive). `to < from`, a malformed date, or a range over 366 days returns `400 INVALID_DATE_RANGE` / `VALIDATION_ERROR`. An empty range returns `200` with empty `rows` and zero totals (periods without invoices are simply absent from `rows`). Every response starts with `{ from, to, generatedAt }`. Day/month grouping is done in SQL with a fixed `+07:00` offset (no MySQL time-zone tables needed). Only `PAID` sales count.

#### GET /reports/revenue

**Roles**: ADMIN · **Query**: `from`, `to`, `groupBy=day|month` (default `day`).
**Response 200 — `data` field of the envelope**:
```json
{
  "from": "2026-10-01", "to": "2026-10-02", "generatedAt": "...", "groupBy": "day",
  "rows": [ { "period": "2026-10-02", "invoiceCount": 2, "grossSales": 80000, "discountAmount": 3000, "netRevenue": 77000 } ],
  "totals": { "invoiceCount": 2, "grossSales": 80000, "discountAmount": 3000, "netRevenue": 77000 }
}
```
`grossSales` = sum of `qty * unitPrice`; `netRevenue` = sum of invoice totals.

#### GET /reports/top-products

**Roles**: ADMIN · **Query**: `from`, `to`, `limit` (1-100, default 10), `sortBy=quantity|revenue` (default `quantity`).
**Response 200 — `data` field of the envelope**: `{ ..., sortBy, limit, rows: [{ rank, productId, sku, name, quantitySold, revenue }] }`.

#### GET /reports/gross-profit

**Roles**: ADMIN · **Query**: `from`, `to`, `groupBy=day|month`.
**Response 200 — `data` field of the envelope**: `{ ..., groupBy, rows: [{ period, invoiceCount, revenue, cogs, grossProfit, marginPercent }], totals: { invoiceCount, revenue, cogs, grossProfit, marginPercent } }`.
`revenue` = sum of line totals (after discount allocation), `cogs` = sum of `qty * unitCostSnapshot`, `marginPercent` = `grossProfit / revenue * 100` rounded to 2 decimals (0 when revenue is 0). This is an estimated gross profit (BR8).

#### GET /reports/inventory

**Roles**: ADMIN, STOCKKEEPER
**Query**: `from`, `to` (movement window), `categoryId`, `search`, `isActive` (omit to include inactive products that still hold stock), `page`, `pageSize`.
**Response 200 — `data` field of the envelope**:
```json
{
  "from": "...", "to": "...", "generatedAt": "...",
  "summary": {
    "productCount": 12, "totalStockValue": 8267500, "lowStockCount": 2,
    "movements": { "qtyIn": 662, "qtyOut": 5, "qtyAdjusted": 0 }
  },
  "products": {
    "items": [ { "productId": 14, "sku": "...", "name": "...", "unit": "lon", "stockQty": 93, "costPrice": 7500,
                 "stockValue": 697500, "reorderLevel": 24, "isLowStock": false, "isActive": true,
                 "qtyIn": 96, "qtyOut": 3, "qtyAdjusted": 0 } ],
    "meta": { "page": 1, "pageSize": 20, "total": 12 }
  }
}
```
`stockValue = stockQty * costPrice`. In the movement window `qtyIn`/`qtyOut` cover non-adjustment movements (purchases, sales, reversals) and `qtyAdjusted` is the signed net of stock-count adjustments. `summary` covers all products matching the filters, not just the current page.
