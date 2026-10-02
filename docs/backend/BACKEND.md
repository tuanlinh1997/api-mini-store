<!--
DOCUMENT METADATA
Owner: @backend-developer
Update trigger: New services/modules, business logic changes, background jobs,
                third-party integrations, auth flow changes
Update scope: Affected sections only
Read by: @frontend-developer (behaviour behind the endpoints), @database-expert (data access
          patterns), @qa-engineer (test seams), @documentation-writer (readability pass only)
-->

# Backend Documentation

> **Runtime**: Node 22 · NestJS 11 on the Fastify adapter · TypeScript (strict)
> **ORM**: Prisma 6 (classic `schema.prisma` + `prisma migrate`) on MySQL 8
> **Auth**: short-lived JWT access token + opaque rotating refresh token, backed by a `user_sessions` table
> **Last updated**: 2026-10-02 (structured logging, token-reuse detection, session cleanup job, backup & restore)

---

## Overview

A single NestJS application (`src/main.ts`) serving a REST API under `/api/v1`, with Swagger UI at `/api/docs`. The request lifecycle is: request id -> global guards (rate limit -> authenticate -> authorise) -> validation pipe -> controller -> service -> Prisma -> response interceptor (Decimal -> number, then success envelope) -> exception filter (error envelope). Endpoint contracts live in [API.md](API.md); schema lives in [../database/DATABASE.md](../database/DATABASE.md); design decisions are in [../architecture/DECISIONS.md](../architecture/DECISIONS.md). This document covers structure and business logic.

---

## Module Layout

```
src/
  main.ts                 # bootstrap (Fastify adapter, listen)
  app.setup.ts            # prefix, helmet, CORS, Swagger, logger, JSON body parser (shared with e2e tests)
  app.module.ts           # module wiring + global guards/pipe/interceptor/filter
  config/environment.ts   # typed env vars + validation (fails fast at startup)
  prisma/                 # PrismaService (global), transaction helpers
  common/
    decorators/           # @Public(), @Roles(), @CurrentUser()
    guards/               # JwtAuthGuard (session check), RolesGuard (deny by default)
    permissions/          # the single role -> permission matrix
    filters/              # AllExceptionsFilter -> error envelope (+ level-based logging)
    logging/              # pino configuration (redaction, request id, pretty in dev)
    errors/               # AppException + ErrorCode enum
    interceptors/         # ResponseEnvelopeInterceptor (Decimal serialisation + envelope)
    swagger/              # ApiOkEnvelope / ApiPaginatedEnvelope / error envelope schema
    validation/           # ValidationPipe factory, DTO helpers, JSON body parser (malformed JSON message)
    pagination/           # PaginationQueryDto, buildPage
    money/                # Decimal helpers, whole-unit quantity assertions (BR4)
    locking/              # SELECT ... FOR UPDATE helper for products
    sequences/            # DocumentNumbersService (invoice/purchase/count/customer numbers)
    time/                 # Asia/Ho_Chi_Minh date-range helpers
  health/                 # GET /health
  modules/
    auth/ users/ categories/ products/ suppliers/ customers/
    purchases/ sales/ inventory/ reports/
prisma/
  schema.prisma  migrations/  seed.ts  seed-demo.ts  verify-demo.ts
scripts/                  # ops CLIs: db-backup.ts, db-restore.ts, db-compare.ts (+ lib/, unit tested)
test/                     # e2e specs (real MySQL test database) + helpers
```

Layering rule (NF5): **controller** (DTO validation, `@Roles`) -> **service** (business rules, transactions) -> **Prisma** (data access). Controllers contain no business logic; services never touch `req`/`res`. Pure business rules are extracted into side-effect-free functions that are unit-tested without a database: `sales/domain/sale-calculator.ts` (discount allocation, payments, points), `purchases/domain/purchase-rules.ts` (weighted-average cost, line validation), `customers/phone.ts`, `common/time/vn-time.ts`.

---

## Authentication & Authorization

### Flow

```mermaid
sequenceDiagram
    participant C as Client
    participant A as API
    participant D as MySQL
    C->>A: POST /auth/login {username, password}
    A->>D: find user; argon2 verify (dummy hash if user unknown)
    A->>D: INSERT user_sessions (sha256(refreshToken), expires_at, ip, user_agent)
    A-->>C: accessToken (JWT {sub, sid, role}, 15 min) + refreshToken
    C->>A: any request, Authorization: Bearer accessToken
    A->>A: verify JWT signature (HS256) and expiry
    A->>D: load session + user by sid (revoked? expired? user.is_active?)
    A->>A: RolesGuard checks @Roles(...)
    C->>A: POST /auth/refresh {refreshToken}
    A->>D: compare-and-set refresh_token_hash (rotation, sliding expiry)
    C->>A: POST /auth/logout
    A->>D: revoked_at = now()
```

- **Passwords**: argon2id (library defaults) via `PasswordService`. If the username does not exist, a dummy hash is verified anyway so response time does not reveal account existence.
- **Login failures (E2/E3)**: unknown user and wrong password return the identical `401 INVALID_CREDENTIALS`. `403 ACCOUNT_LOCKED` is returned only after the password verified.
- **Immediate revocation**: `JwtAuthGuard` loads the session and user on every request. Logout, password reset and locking a user (which revokes all of the user's sessions) therefore take effect at once, not at token expiry. The user's current role is read from the DB each time, so role changes apply immediately too.
- **Refresh tokens** are 48 random bytes (base64url); only the SHA-256 hash is stored (`user_sessions.refresh_token_hash`, unique). Rotation updates the hash in place with a compare-and-set, so of two concurrent refreshes with the same token exactly one wins. Each session also stores `previous_refresh_token_hash` (the token the last rotation replaced). **Token-reuse detection**: if a refresh request presents a token that is not current but equals a session's `previous_refresh_token_hash`, the token was already rotated, so either a stale client or an attacker holds a copy; the whole session is revoked (`revoked_at = now`), a `warn` line `Refresh token reuse detected: session <id> of user <id> revoked` is logged, and the request gets `401 INVALID_REFRESH_TOKEN`. The user must log in again; the access token of that session stops working at once because the guard checks the session on every request. Limits: only the immediately previous token is remembered (older ones just fail with 401), and two truly concurrent refreshes with the same token are treated as a race (loser gets 401, no revocation) rather than as reuse.
- **Bearer header, no cookies**: the API never relies on ambient browser credentials, so there is no CSRF surface; XSS exposure of the token is a frontend storage concern. Tokens are sent only via the `Authorization` header.
- **Rate limiting**: `@nestjs/throttler` (in-memory) globally (`THROTTLE_LIMIT` per `THROTTLE_TTL_SECONDS`) plus a strict `login` throttler on `POST /auth/login` (`LOGIN_THROTTLE_LIMIT`, default 5 per 60 s per IP). Set `TRUST_PROXY=true` behind a reverse proxy so the real client IP is used. The in-memory store is per process; use a shared store before running multiple instances.
- **Authorisation**: global `RolesGuard`, deny by default. A route must be `@Public()` or declare `@Roles(...)`. Denials are logged (`AccessControl` logger: user id, role, method, path, required roles) for UC-05 E2. The matrix is `PERMISSIONS` in `src/common/permissions/permissions.ts`; change roles there only.
- **Data-level restriction**: `costPrice` is omitted from product responses for `CASHIER`.

### Permission matrix (defaults)

| Capability | ADMIN | CASHIER | STOCKKEEPER |
|------------|:-----:|:-------:|:-----------:|
| Users (list/create/update/lock/reset) | yes | - | - |
| Categories/products: read, lookup | yes | yes | yes |
| Categories/products: create/update/(de)activate | yes | - | yes |
| Suppliers | yes | - | yes |
| Purchases (create/edit draft/receive/cancel) | yes | - | yes |
| POS sales: create, list, detail, print | yes | yes | - |
| Customers: lookup/create/update | yes | yes | - |
| Inventory: current stock | yes | yes | yes |
| Inventory: low-stock, movements, stock counts | yes | - | yes |
| Reports: revenue, top products, gross profit | yes | - | - |
| Reports: inventory | yes | - | yes |

The SRS marks the stockkeeper's product permission and admin selling as needing owner confirmation (ADR-007).

---

## Business Logic Domains

| Domain | Module | Responsibility |
|--------|--------|----------------|
| Auth | `modules/auth` | login, refresh rotation, logout, profile; `PasswordService` |
| Users | `modules/users` | admin account management, lock/unlock, password reset, last-admin protection |
| Catalog | `modules/categories`, `modules/products`, `modules/suppliers` | master data; deactivate instead of delete (BR10); POS lookup |
| Customers | `modules/customers` | code/phone lookup, phone normalisation, generated `KH` codes |
| Purchasing | `modules/purchases` | DRAFT -> RECEIVED/CANCELLED, stock increase, weighted-average cost |
| Sales | `modules/sales` | POS checkout transaction, invoice, payments, points, receipt payload |
| Inventory | `modules/inventory` | stock views, low-stock, movements ledger, stock counts |
| Reports | `modules/reports` | revenue, top products, gross profit, inventory valuation (raw SQL aggregation) |

### Transactions and locking

All stock-affecting flows run in one interactive Prisma `$transaction` (default MySQL isolation REPEATABLE READ; locking reads see the latest committed rows) with pessimistic row locks:

1. **Products** are locked with `SELECT ... FROM products WHERE id IN (...) ORDER BY id FOR UPDATE` (`common/locking/product-locks.ts`). Locks are always taken in ascending id order, so concurrent checkouts/receipts queue instead of deadlocking.
2. **Purchases**: the purchase row is locked and its status re-checked inside the transaction, so a double receive is rejected (`409 PURCHASE_ALREADY_RECEIVED`) and stock is added once, even when two requests race.
3. **Document numbers** are drawn last among the locks (after products), so lock order is always products -> sequence -> customer. The create-purchase `receiveNow` path takes the `PN` sequence before products, which is safe because only receive transactions touch the `PN` sequence row and they all take it first.
4. The database `CHECK (stock_qty >= 0)` is the final safety net behind the application check (BR1).
5. Transactions use `maxWait 5 s` / `timeout 15 s` (`WRITE_TRANSACTION_OPTIONS`).

**Checkout (`SalesService.checkout`, BR1/BR3/UC-02)**: merge duplicate cart lines and assert whole-unit quantities -> lock products -> products must exist and be active (`422 PRODUCT_UNAVAILABLE`) -> stock check (`409 INSUFFICIENT_STOCK` with the current availability per short product) -> snapshot sku/name/price/cost per line -> `calculateSale` (discount rules, proportional allocation) -> `resolvePayments` (sum must equal the total, cash tendered/change) -> verify the customer -> draw the invoice number -> insert sale/items/payments (status `PAID`) -> decrement stock -> write `SALE` movements (negative `quantity_change`, `created_by` = cashier) -> add loyalty points. Any thrown error rolls the whole transaction back (E6).

**Receive (`PurchasesService.receiveWithinTransaction`, BR3/BR11/UC-03)**: lock purchase row -> status must be DRAFT -> supplier active -> lock products by id -> all products active -> per line `new_cost = round2((oldQty*oldCost + qty*unitCost)/(oldQty+qty))` (`unitCost` if `oldQty = 0`), `stock += qty` -> `PURCHASE` movements -> status RECEIVED, `received_at`, `received_by`. Used by `POST /purchases/:id/receive` and by `receiveNow` on create.

**Stock count (`InventoryService.createStockCount`, UC-04/BR11)**: lock the product -> compare with `expectedSystemQty` (`409 STOCK_CONFLICT` carries the current value) -> insert `stock_counts` row (always) -> insert an `ADJUSTMENT` movement with the signed difference (skipped if 0) -> set `stock_qty = counted`. Cost is untouched.

### Document numbering

`document_sequences(sequence_key, last_value)` holds one row per sequence: `HD20261002`, `PN20261002`, `KK20261002` (prefix + store-day) and the global `KH`. `DocumentNumbersService` runs, inside the caller's transaction, `INSERT ... ON DUPLICATE KEY UPDATE last_value = last_value + 1` (this takes the row's exclusive lock immediately, avoiding the shared-to-exclusive deadlock of `INSERT IGNORE` + `SELECT FOR UPDATE`) followed by `SELECT last_value ... FOR UPDATE`. The lock is held until commit, so concurrent transactions get distinct numbers, and a rolled-back transaction gives its number back (no gaps). The day is the `Asia/Ho_Chi_Minh` calendar day of `now`. `last_value` is a reserved word in MySQL 8 and is always backtick-quoted in raw SQL.

### Money, quantities and time

- Money is `DECIMAL(12,2)` and quantities `DECIMAL(12,3)`; all arithmetic uses `Prisma.Decimal` (decimal.js), never JS floats. Inputs are validated as finite numbers with <= 2 decimals; responses serialise Decimals to JSON numbers via `ResponseEnvelopeInterceptor` (values are far below 2^53).
- BR4: v1 sells whole units only. DTOs use `@IsInt`, and services re-assert with `assertPositiveIntegerQuantity` / `assertNonNegativeIntegerQuantity`; the 3-decimal column keeps weighed goods possible later.
- Timestamps are stored in UTC. Report ranges and invoice-number days are computed in `Asia/Ho_Chi_Minh` (luxon). Report SQL groups with `DATE_ADD(sold_at, INTERVAL 7 HOUR)` so MySQL time-zone tables are not required.

### Reports

Raw, fully parameterised SQL aggregation (`ReportsService`). User-controlled values are always bound parameters; the only interpolated fragments (`DATE_FORMAT` pattern, `ORDER BY` choice) come from fixed whitelists keyed by validated enums. Ranges: `[from 00:00, to+1 day 00:00)` store time, max 366 days.

### Response envelope and error handling

There is deliberately **no try/catch in controllers or services**; errors are thrown and converted in one place.

- **Success**: `ResponseEnvelopeInterceptor` (global, one interceptor) first serialises Decimals/BigInts to numbers, then wraps the result as `{ success: true, statusCode, code: "OK", message, data, meta?, requestId, timestamp }`. List services return a `Paginated` instance (explicit marker class, not duck typing); the interceptor maps it to `data = items` and a top-level `meta`. The message comes from `@ResponseMessage('...')` (default `Thành công`); the status mirrors `@HttpCode` or 201 for POST / 200 otherwise. Swagger UI/JSON are served outside Nest handlers and are not wrapped.
- **Errors**: `AppException(status, code, message, details?)` for domain errors; `AllExceptionsFilter` converts everything to `{ success: false, statusCode, code, message, data: null, details?, requestId, timestamp }`. Logging by severity is described in [Logging & observability](#logging--observability).
- **Mapped infrastructure errors** (`src/prisma/database-errors.ts`, filter): deadlock/lock wait (P2034, raw P2010 with MySQL 1213/1205) -> 409 `TRANSACTION_CONFLICT`; interactive transaction timeout (P2028) -> **503** `TRANSACTION_TIMEOUT` (the server could not finish in time, the transaction is rolled back and a retry is safe); DB unreachable (`PrismaClientInitializationError`, P1001/P1002/P1008/P1017/P2024) -> 503 `SERVICE_UNAVAILABLE`; CHECK violation (MySQL 3819 via P2010/P2004/error text) -> 422 `CONSTRAINT_VIOLATION`; `PrismaClientValidationError` -> 400; P2002 -> 409 `DUPLICATE_VALUE`; P2003 -> 409 `RESOURCE_IN_USE`; P2025 -> 404; unknown/rust panic -> generic 500.
- **Fastify-level errors** (wrong content type, oversize body, unknown route) reach the same filter (Nest turns them into HTTP exceptions) and use the same envelope; a raw `FST_*` error is also mapped as a fallback.
- **Malformed JSON**: Nest rewraps Fastify's `FST_ERR_CTP_INVALID_JSON_BODY` into a generic `HttpException(400)`, which loses the code, so the filter could not tell it from other 400s. `app.setup.ts` therefore registers its own `application/json` parser (`common/validation/json-body-parser.ts`) that delegates to Fastify's default parser (prototype-poisoning protection kept) and converts its two errors into `AppException`: invalid JSON -> `400 VALIDATION_ERROR` "Nội dung JSON không hợp lệ."; empty body -> `400 VALIDATION_ERROR` "Nội dung yêu cầu không được để trống.".
- **Validation messages** are translated to Vietnamese globally in the ValidationPipe `exceptionFactory` (`src/common/validation/validation-messages.ts`): constraint name -> template, field label from a map; decorators that already carry a Vietnamese message keep it. `details` stays `[{ field, messages[] }]`.

### Transaction retry strategy

`PrismaService.runWriteTransaction(fn)` wraps every interactive write transaction (checkout, purchase create/receive/update/cancel, stock count, customer create, user lock/demote/reset) in `withTransactionRetry` (`src/prisma/transaction-retry.ts`): on a deadlock or lock wait timeout the **whole transaction** is run again, up to 3 attempts with a short jittered back-off (25 ms x attempt + 0-50 ms). Only those transient conflicts are retried (a try/catch justified here); business errors (`INSUFFICIENT_STOCK`, ...) and everything else propagate immediately. When the attempts run out the client gets `409 TRANSACTION_CONFLICT` ("Hệ thống đang bận do có giao dịch đồng thời, vui lòng thử lại."). Transaction bodies are re-runnable by design (all reads happen inside, `now` is taken inside, nothing is committed until the end). Sequence allocation happens inside the same transaction, so it is covered.

---

## Logging & observability

**Library**: `nestjs-pino` (pino 10 + pino-http). `main.ts` creates the app with `bufferLogs: true` and `app.useLogger(app.get(Logger))`, so every existing `new Logger('X').log(...)` call (Nest's `Logger`) is emitted through pino too; no call sites changed. Output is one JSON object per line on stdout; with `NODE_ENV=development` the logs go through `pino-pretty` (devDependency, never loaded in production/test).

**Fields on every request-scoped line**: `time` (ISO-8601 UTC), `level` (pino numbers: 30 info, 40 warn, 50 error), `requestId` (the inbound `X-Request-Id` if it matches `[A-Za-z0-9._-]{1,64}`, else a UUID; the same id is returned as `requestId` in the response envelope), `userId` and `role` once the request is authenticated (`JwtAuthGuard` calls `PinoLogger.assign`), `context` (logger name). The per-request completion line adds `req.method`, `req.path` (query string stripped), `route` (matched pattern such as `/api/v1/sales/:id`), `res.statusCode` and `responseTime` (ms).

**Redaction** (`common/logging/logging.config.ts`, pino `redact`): `req.headers.authorization`, `req.headers.cookie`, `res.headers["set-cookie"]`, and any `password`, `refreshToken`, `accessToken` (also one level deep). Request bodies are never logged, so passwords sent to `POST /auth/login` cannot appear in log lines.

**Exception filter levels** (`AllExceptionsFilter`):

| Case | Level | Content |
|------|-------|---------|
| 5xx (unexpected error, DB outage, transaction timeout) | `error` | `code`, `statusCode`, `route`, and `err` (type, message, **stack**) |
| Business errors: any `AppException`, any 409 or 422 (stock, duplicates, conflicts, constraint violations) | `warn` | `code`, `statusCode`, `route` (+ the request's `requestId`, `userId`, `role`) |
| Everything else: validation 400, 404, 415, 429 | `debug` | same fields; visible with `LOG_LEVEL=debug` |

Malformed JSON is raised as an `AppException` (see above), so it is logged at `warn` like other business errors. `LOG_LEVEL` keeps its values (`debug`, `log` = info, `warn`, `error`, `silent`). Other `warn` sources: failed logins, locked-account logins, role denials (`AccessControl`), refresh-token reuse.

**Source maps**: `npm start` and `npm run start:prod` run `node --enable-source-maps dist/main.js`, and `tsconfig.json` has `sourceMap: true`, so stack frames show `src/....ts:line:col` instead of `dist/....js`. If you start the build another way (Docker `CMD`, pm2, systemd) keep the `--enable-source-maps` flag (or `NODE_OPTIONS=--enable-source-maps`).

Sample production lines:

```json
{"level":40,"time":"2026-10-02T07:18:27.457Z","req":{"method":"POST","path":"/api/v1/sales"},"requestId":"demo-409","userId":2,"role":"CASHIER","context":"AllExceptionsFilter","code":"INSUFFICIENT_STOCK","statusCode":409,"route":"/api/v1/sales","msg":"INSUFFICIENT_STOCK: Không đủ tồn kho ..."}
{"level":30,"time":"2026-10-02T07:18:27.457Z","req":{"method":"POST","path":"/api/v1/sales"},"requestId":"demo-409","userId":2,"role":"CASHIER","route":"/api/v1/sales","res":{"statusCode":409},"responseTime":13,"msg":"POST /api/v1/sales 409"}
```

Decision record: ADR-009 in [../architecture/DECISIONS.md](../architecture/DECISIONS.md).

---

## Background Jobs & Scheduled Tasks

| Job | Where | Schedule | What it does |
|-----|-------|----------|--------------|
| Stale session cleanup | `modules/auth/session-cleanup.service.ts` (`@nestjs/schedule`, registered through `SchedulerRegistry`) | `SESSION_CLEANUP_CRON`, default `0 3 * * *` (daily 03:00, server local time) | Deletes `user_sessions` rows whose `expires_at` **or** `revoked_at` is older than `SESSION_RETENTION_DAYS` (default 30). Logs `Session cleanup started` / `Session cleanup finished {deleted, durationMs}` (or `Session cleanup failed` with the stack). |

The job is idempotent (a plain `deleteMany`), so a second run or a second instance is harmless. Disable it with `SESSION_CLEANUP_ENABLED=false` (the e2e tests do; when scaling out, enable it on one instance only). The schedule is read at bootstrap, so changing the variables needs a restart. Database backups are an operating-system job, see [Backup & restore](#backup--restore). Still open in task #006's scope: the throttler uses an in-memory store and must move to a shared store before running more than one instance.

---

## External Integrations

None. Payment methods are recorded only; there is no payment gateway, e-invoicing, scanner or printer integration (SRS section 1.2). `GET /sales/:id/print` returns data for the client to render.

---

## Configuration

Environment variables are validated at startup (`src/config/environment.ts`); the app refuses to start on invalid values. Copy `.env.example` to `.env`.

| Variable | Default | Purpose |
|----------|---------|---------|
| `NODE_ENV` | `development` | `development` / `production` / `test` |
| `HOST`, `PORT` | `0.0.0.0`, `3000` | Listen address |
| `LOG_LEVEL` | `log` | `debug`, `log` (info), `warn`, `error`, `silent` |
| `TRUST_PROXY` | `false` | Trust `X-Forwarded-*` (set behind a reverse proxy) |
| `CORS_ORIGINS` | empty | Comma-separated allowed browser origins; empty disables CORS |
| `SWAGGER_ENABLED` | `true` | Serve `/api/docs`; disable in production if not wanted (it also relaxes the CSP for Swagger UI) |
| `DATABASE_URL` | required | MySQL connection string |
| `JWT_ACCESS_SECRET` | required, >= 32 chars | HS256 signing secret |
| `ACCESS_TOKEN_TTL_SECONDS` | `900` | Access token lifetime |
| `REFRESH_TOKEN_TTL_DAYS` | `7` | Refresh/session lifetime (sliding, extended on rotation) |
| `SESSION_CLEANUP_ENABLED` | `true` | Register the daily stale-session purge |
| `SESSION_CLEANUP_CRON` | `0 3 * * *` | Cron expression of the purge |
| `SESSION_RETENTION_DAYS` | `30` | Sessions expired/revoked longer ago than this are deleted |
| `BACKUP_DIR` | `./backups` | Where `npm run db:backup` writes (gitignored); read by the CLI only |
| `BACKUP_RETENTION_COUNT` | `14` | Newest backups kept by `db:backup`; read by the CLI only |
| `MYSQLDUMP_PATH`, `MYSQL_PATH` | unset (use `PATH`) | Full path of `mysqldump` / `mysql` when not on `PATH`; CLI only |
| `THROTTLE_TTL_SECONDS`, `THROTTLE_LIMIT` | `60`, `300` | Global rate limit per IP |
| `LOGIN_THROTTLE_TTL_SECONDS`, `LOGIN_THROTTLE_LIMIT` | `60`, `5` | Login rate limit per IP |
| `MAX_DISCOUNT_PERCENT_CASHIER` | `10` | Max invoice discount as % of subtotal for cashiers |
| `MAX_DISCOUNT_PERCENT_ADMIN` | `100` | Same for admins (still strictly below the subtotal) |
| `POINTS_PER_VND` | `10000` | VND per loyalty point (BR6) |
| `STORE_NAME`, `STORE_ADDRESS`, `STORE_PHONE` | `Siêu thị mini`, empty, empty | Receipt header |
| `SEED_ADMIN_USERNAME`, `SEED_ADMIN_PASSWORD`, `SEED_DEMO_PASSWORD` | in `.env.example` | Used only by `npm run prisma:seed` (passwords >= 8 chars) |
| `TEST_DATABASE_URL` | `mysql://root:@127.0.0.1:3306/mini_store_test` | E2E database; its name must end with `_test` |

Never commit `.env`. Secrets and credentials appear only in `.env`; `.env.example` holds placeholders.

---

## Running

```bash
npm install
cp .env.example .env              # then set JWT_ACCESS_SECRET and review the rest
npx prisma migrate deploy         # or `npm run prisma:migrate` while developing
npm run prisma:seed               # admin + demo users, categories, products, suppliers, customers
npm run start:dev                 # http://localhost:3000/api/v1  ·  Swagger: /api/docs
```

| Command | Purpose |
|---------|---------|
| `npm run start:dev` | Dev server with watch |
| `npm run build` / `npm start` / `npm run start:prod` | Compile to `dist/` and run it with `--enable-source-maps` |
| `npm run lint` / `npm run typecheck` | ESLint / `tsc --noEmit` |
| `npm test` | Unit tests (colocated `*.spec.ts`, no database) |
| `npm run test:e2e` | E2E tests (supertest + the real app on `mini_store_test`; migrations are applied automatically) |
| `npm run prisma:migrate` / `prisma:deploy` / `prisma:seed` | Migrations / seed |
| `npm run db:backup` / `db:restore` / `db:compare` | MySQL backup, restore, row-count comparison (see Backup & restore) |

The seed runs through the Nest application context: opening stock arrives via a received purchase, so movements and costs are consistent. It is idempotent.

## Backup & restore

Requirement NF7. The CLIs live in `scripts/` (TypeScript, run with `ts-node`; unit tests in `scripts/lib/ops.spec.ts`). The runbook is kept here because `docs/devops/` was owned by another workstream when this was written; @cicd-engineer may move or link it from `DEVOPS.md` later.

### Commands

| Command | Behaviour |
|---------|-----------|
| `npm run db:backup` | `mysqldump --single-transaction --routines --triggers --set-gtid-purged=OFF --no-tablespaces --default-character-set=utf8mb4` of the database in `DATABASE_URL`, gzipped to `BACKUP_DIR/<db>_<YYYYMMDD>T<HHMMSS>Z.sql.gz` (UTC time, sortable). It writes a `.partial` file and renames it only when the dump succeeded, then deletes all but the newest `BACKUP_RETENTION_COUNT` (default 14) backups of that database. Files that do not match the naming pattern are never deleted. Exit code 1 on any failure. |
| `npm run db:restore -- --file=<backup.sql.gz> --target=<db> [--force]` | Creates `<db>` (utf8mb4 / utf8mb4_unicode_ci) if needed and loads the dump into it (`.gz` or plain `.sql`). **Refuses** when `<db>` is the database named in `DATABASE_URL`, and when `NODE_ENV=production`, unless `--force` is given. The target name must match `[A-Za-z0-9_]+`. |
| `npm run db:compare -- --source=<db> --target=<db>` | Exact `COUNT(*)` per table in two databases on the `DATABASE_URL` server; exit 1 if any differ. |
| `npm run seed:demo:verify -- --database-url=mysql://...` | The 24 consistency checks, against another database (also `VERIFY_DATABASE_URL`). Default is `DATABASE_URL`. |

Credentials come from `DATABASE_URL` (host, port, user, password, URL-decoded). The password is passed to the MySQL tools **only through the `MYSQL_PWD` environment variable of the child process**, never on the command line (so it is not visible in the process list). The tools are found on `PATH`, or via `MYSQLDUMP_PATH` / `MYSQL_PATH` (for example Laragon: `C:/laragon/bin/mysql/mysql-8.0.30-winx64/bin/mysqldump.exe`); if neither works the CLI says which variable to set. `--single-transaction` gives a consistent InnoDB snapshot without blocking the API. The dump is made without `--databases`, so it carries no `CREATE DATABASE` / `USE` and can be restored under any name. Backups hold real business data: keep `BACKUP_DIR` outside the web root, restrict its permissions, and copy it off the machine (a backup on the same disk is not a disaster-recovery plan).

### Daily schedule

Windows Task Scheduler (daily at 02:30, runs as the current user; adjust the project path):

```bat
schtasks /Create /TN "MiniStore\DbBackup" /SC DAILY /ST 02:30 /RL HIGHEST /F ^
  /TR "cmd /c cd /d C:\apps\api-mini-store && npm run db:backup >> backups\backup.log 2>&1"
schtasks /Run /TN "MiniStore\DbBackup"
schtasks /Query /TN "MiniStore\DbBackup" /V /FO LIST
schtasks /Delete /TN "MiniStore\DbBackup" /F
```

`/Run` tests the task once right now, `/Query` shows its last result, `/Delete` removes it. `DATABASE_URL`, `BACKUP_DIR` and, if needed, `MYSQLDUMP_PATH` are read from the `.env` in the project folder (the task starts there). Run it as an account that can read `.env` and write `BACKUP_DIR`.

Linux cron (`crontab -e` of the service user, 02:30 daily):

```cron
30 2 * * * cd /opt/api-mini-store && /usr/bin/npm run db:backup >> /var/log/mini-store-backup.log 2>&1
```

After the first night check the log: success prints `Backup written: ...` and a retention line; failure prints `Backup failed: ...` and exits with code 1 (wire that to monitoring if available). Retention is count-based: 14 daily backups = two weeks. The owner decides the real retention period (task #003); change `BACKUP_RETENTION_COUNT` accordingly.

### Restore runbook

1. **Stop writes**: stop the API (or put it in maintenance) if you restore over live data; a rehearsal needs nothing stopped.
2. **Pick the file**: the newest good `BACKUP_DIR/<db>_<timestamp>.sql.gz`. Confirm it is complete: `gzip -t file.sql.gz`, and `zcat file.sql.gz | tail -n 2` should end with `-- Dump completed on ...`.
3. **Rehearse into a scratch database first** (do not skip this before restoring over production):
   ```bash
   npm run db:restore -- --file=backups/mini_store_20261002T071553Z.sql.gz --target=mini_store_restore_check
   npm run db:compare -- --source=mini_store --target=mini_store_restore_check
   npm run seed:demo:verify -- --database-url="mysql://root:@127.0.0.1:3306/mini_store_restore_check"   # demo/dev data only
   ```
   Drop the scratch database afterwards: `DROP DATABASE mini_store_restore_check;`.
4. **Restore for real**: restore into a new database and point `DATABASE_URL` at it, or overwrite in place with `npm run db:restore -- --file=<file> --target=<db> --force` (the dump drops and recreates every table it contains). With `NODE_ENV=production` `--force` is also required, so this cannot happen by accident.
5. **Bring the schema up to date**: `npx prisma migrate deploy` (a no-op if the backup is from the current version; applies newer migrations if the backup is older).
6. **Start the API and smoke-test**: `GET /api/v1/health`, log in, open a recent sale. Sessions are restored with the data; users may need to log in again if the backup is old.
7. **Record** what was restored, from which file, and why.

### Rehearsal result (2026-10-02, dev database)

`npm run db:backup` produced `mini_store_20261002T071553Z.sql.gz` (164 KiB). It was restored with `db:restore` into the scratch database `mini_store_restore_check`; `seed:demo:verify` against the restored copy passed 24/24 checks; `db:compare` showed identical row counts in all 15 tables (for example `sales` 1192, `inventory_movements` 4367, `products` 117, `users` 7); the scratch database was then dropped. Guards verified: restoring into `mini_store`, and restoring with `NODE_ENV=production`, are both refused without `--force`.

## Demo data seed

`npm run seed:demo` fills **every table** of the dev database with ~90 days of believable Vietnamese mini-supermarket activity ending today (store time), so reports, low-stock alerts, top products, gross profit and the movements ledger look meaningful in Swagger or a frontend. It is separate from the small base seed (`npm run prisma:seed`), which keeps working as before.

```bash
npm run seed:demo -- --reset         # clear all tables, re-seed base users, create the demo data (~5 s)
npm run seed:demo                    # only on a database that has no business data yet
npm run seed:demo -- --reset --seed=7   # same seed => identical data (default seed 20261002, or DEMO_SEED)
npm run seed:demo:verify             # 24 PASS/FAIL consistency checks (exit code 1 on any FAIL)
```

**Safety**: refuses `NODE_ENV=production`; refuses any database other than `mini_store` / `mini_store_dev` (never `mini_store_test`); without `--reset` it refuses when business data already exists, so demo data is never applied twice. `--reset` truncates all tables (including users and `document_sequences`), then recreates the base users (admin from `SEED_ADMIN_*`, `cashier`, `stockkeeper`) and the demo data. Passwords come from `SEED_ADMIN_PASSWORD` / `SEED_DEMO_PASSWORD` (see `.env.example`); nothing is hardcoded.

**What it creates** (typical run): 7 users (admin, 3 cashiers incl. one who joins on day 30, 2 stockkeepers, 1 locked former cashier who sold until day 55), 8 sessions (some revoked), 10 categories (1 inactive), 8 suppliers (1 deactivated mid-period; its categories move to another supplier), ~117 products (valid EAN-13 barcodes with prefix 893 on ~88 %, prices ending in 000/500, 6 inactive, ~10 deliberately run down below their reorder level, a few price rises), 60 customers (9 without phone, codes `KH000001..`), ~54 purchases (opening stock-in on day 1, periodic and emergency restocks, 4 DRAFT, 2 CANCELLED), ~1,190 sales with ~4,000 lines and ~1,240 payments (weekends and evenings busier, ~38 % with a customer, ~10 % discounted within the role caps, ~65 % cash with 10k/50k/100k/500k tendered, plus card, transfer with reference and split payments), ~4,400 inventory movements, 15 stock counts (zero, negative and positive differences with reasons).

**How consistency is guaranteed**: the data is produced by one chronological in-memory simulation (`prisma/demo/simulation.ts`) that reuses the real domain code (`calculateSale` and discount allocation, `resolvePayments`, `calculateLoyaltyPoints`, `weightedAverageCost`, `buildPurchaseLines`, `formatDocumentNumber`) and then bulk-inserts the rows in one transaction with explicit ids. Opening stock is modelled as received purchases, so `stock_qty` always equals the sum of its movements. A sale can only take stock that exists at that moment; every sale snapshots the product's `cost_price` at that moment, and `cost_price` evolves by weighted average on each receive. Invoice/purchase/count numbers carry the event's own store-time date with per-day sequences, and `document_sequences` ends at the highest issued value, so the next real checkout gets the next number. Timestamps are backdated and stored in UTC. A seeded PRNG (`prisma/demo/random.ts`) makes runs reproducible for a given seed and day.

`seed:demo:verify` checks: stock = sum of movements, no negative stock (also a chronological replay), invoice arithmetic (subtotal - discount = total, line totals, payments, cash change), customer points, invoice/purchase/count number uniqueness and date parts, `document_sequences` values, RECEIVED purchases have matching movements while DRAFT/CANCELLED have none, SALE and ADJUSTMENT movements, and EAN-13 checksums.

## Testing

- **Unit** (`npm test`, which also picks up `scripts/**/*.spec.ts`): the pure rules (discount allocation, payment resolution, loyalty points, weighted-average cost, date ranges, phone normalisation, document number formatting), `AuthService.login` and refresh-token reuse detection, the session cleanup job, `RolesGuard`, the exception filter (including its log levels), logging redaction, the JSON body parser mapping, backup/restore helpers, the Decimal serializer.
- **E2E** (`npm run test:e2e`, `--runInBand`, real MySQL): login/logout/refresh rotation, token-reuse revocation, stale-session purge, immediate revocation on lock, login rate limiting, RBAC matrix and cost hiding, POS checkout (success, snapshots, customer/payment-method list filters, insufficient stock + full rollback, concurrent last-unit race, invoice sequence, discount caps, receipt), purchase receive (weighted average, double receive, concurrent receive, receiveNow, cancel, inactive supplier/product), stock count (adjustment, conflict, zero difference, validation), reports, catalog/customer/user rules. Each file resets the test database and seeds the three staff roles.
