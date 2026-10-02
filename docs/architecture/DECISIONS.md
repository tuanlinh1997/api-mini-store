<!--
DOCUMENT METADATA
Owner: @systems-architect
Update trigger: Any significant architectural, technology, or design pattern decision is made
Update scope: Append new ADRs only. Never edit the body of an Accepted ADR.
Read by: All agents. Check this file before proposing changes that may conflict with prior decisions.
-->

# Architecture Decision Records

> This log captures the context and reasoning behind key decisions so they are never lost.
>
> **Rule**: Once an ADR is marked **Accepted**, do not edit its body. If a decision needs to change, write a new ADR that explicitly supersedes the old one. Add `**Status**: Superseded by ADR-XXX` to the old record.
>
> **Agents**: Read the relevant ADRs before proposing architectural changes. A proposal that contradicts an Accepted ADR needs a new ADR — not a silent override.
>
> ADR-001 to ADR-008 were recorded together with the initial backend implementation (task #001), at the project owner's request.

---

## Decision Index

| ID | Title | Status | Date |
|----|-------|--------|------|
| ADR-001 | NestJS on the Fastify adapter | Accepted | 2026-10-02 |
| ADR-002 | MySQL 8 with Prisma 6 | Accepted | 2026-10-02 |
| ADR-003 | JWT access tokens backed by database sessions | Accepted | 2026-10-02 |
| ADR-004 | Pessimistic row locking and a sequences table | Accepted | 2026-10-02 |
| ADR-005 | Defaults for the SRS open questions (points, discounts, payments, invoice format) | Accepted | 2026-10-02 |
| ADR-006 | Money and quantities as DECIMAL, whole units in v1 | Accepted | 2026-10-02 |
| ADR-007 | Stockkeeper product permission and the single permission matrix | Accepted | 2026-10-02 |
| ADR-008 | One response envelope for success and errors, centralised error mapping | Accepted | 2026-10-02 |
| ADR-009 | Structured JSON logging with pino and refresh-token reuse detection | Accepted | 2026-10-02 |

---

## ADR-001: NestJS on the Fastify adapter

**Date**: 2026-10-02
**Status**: Accepted
**Deciders**: Project owner / @backend-developer

### Context
The SRS requires separated presentation, business and data-access layers (NF5), input validation, role checks on the server (F1/NF2) and 10+ concurrent users with sub-2 s POS responses (NF1). The team needs a structure that stays maintainable as modules grow.

### Options Considered
1. **Express (plain)**: minimal, familiar — Pros: ubiquitous. Cons: no enforced structure; DI, validation and guards must be hand-assembled.
2. **NestJS + Express adapter**: Pros: structure, DI, guards, pipes, Swagger. Cons: Express is slower than Fastify.
3. **NestJS + Fastify adapter**: Pros: same structure, faster request handling, schema-friendly, first-class `@fastify/helmet`. Cons: a few Express-only middlewares are unavailable; request/response types differ.

### Decision
NestJS 11 with `@nestjs/platform-fastify` (option 3), TypeScript strict. Modules map to the SRS domains; controllers handle DTO validation/auth/RBAC, services hold business rules and transactions, Prisma does data access. Swagger is served at `/api/docs`; the global prefix is `/api/v1`.

### Consequences
- **Positive**: enforced layering, declarative guards/validation, generated API docs, good throughput headroom.
- **Negative**: contributors must know Nest conventions; Express-specific middleware (e.g. `cookie-parser`, `csurf`) cannot be dropped in.
- **Neutral**: Swagger UI needs a relaxed CSP when enabled (documented in BACKEND.md).

---

## ADR-002: MySQL 8 with Prisma 6

**Date**: 2026-10-02
**Status**: Accepted
**Deciders**: Project owner / @backend-developer

### Context
The SRS mandates MySQL 8 / InnoDB with DECIMAL money, constraints and transactions. We need a typed, parameterised data layer and a committed migration history. Several rules need features no ORM abstracts well (row locks, CHECK constraints, report aggregation).

### Options Considered
1. **Prisma 6 (classic `schema.prisma` + `prisma migrate`)**: Pros: types, migrations, `$queryRaw` and interactive transactions. Cons: no CHECK constraints in the schema; no down-migrations.
2. **Prisma 7**: newer, but requires the new config file and driver adapters — extra migration cost with no benefit here.
3. **TypeORM / Drizzle / Knex**: Pros: closer to SQL. Cons: weaker typing or migration story for this team.

### Decision
Prisma pinned to the latest 6.x (`prisma` and `@prisma/client`). Rules Prisma cannot express are done in SQL: CHECK constraints are hand-added to the initial migration; `SELECT ... FOR UPDATE`, sequence increments and report aggregation use parameterised `$queryRaw` inside interactive transactions. Each migration folder also holds a hand-written `down.sql`, applied manually.

### Consequences
- **Positive**: typed queries, SQL injection-safe by default, reproducible migrations, raw SQL available where needed.
- **Negative**: CHECK constraints are invisible to drift detection; rollbacks are manual; the `package.json#prisma` seed config is deprecated in Prisma 7 and will need moving to `prisma.config.ts` on upgrade.
- **Neutral**: migrations follow Prisma's `<timestamp>_<name>/migration.sql` layout rather than `.claude/rules/migrations.md`'s file naming.

---

## ADR-003: JWT access tokens backed by database sessions

**Date**: 2026-10-02
**Status**: Accepted
**Deciders**: Project owner / @backend-developer

### Context
Logout and locking a user must take effect immediately (F1/F2, UC-01); passwords must be strongly hashed; the SRS asks for XSS/CSRF protection appropriate to the session mechanism (NF2). The client is a separate Next.js frontend.

### Options Considered
1. **Stateless JWT only**: Pros: no DB lookup. Cons: cannot revoke before expiry.
2. **Server sessions with cookies**: Pros: easy revocation. Cons: cookies bring CSRF; cross-origin frontend complicates it.
3. **Short-lived JWT carrying a session id + DB-backed `user_sessions` + rotating opaque refresh token** (Authorization header).

### Decision
Option 3. Access token: HS256 JWT, 15 minutes, claims `sub`, `sid`, `role`. `JwtAuthGuard` verifies the signature and then loads the session and user on every request (revoked? expired? user inactive?), so logout, password reset and user lock apply instantly. Refresh tokens are 48 random bytes, stored only as a SHA-256 hash, rotated in place on use (compare-and-set), 7-day sliding lifetime. Passwords use argon2id. Credentials travel in the `Authorization` header only; no cookies means no CSRF surface. Login returns one generic error for unknown user or wrong password and reveals `ACCOUNT_LOCKED` only after the password verified; login is strictly rate limited.

### Consequences
- **Positive**: instant revocation, no CSRF, refresh-token theft limited by rotation, no account enumeration.
- **Negative**: one indexed DB read per request; re-use of a rotated refresh token is rejected but does not revoke the whole session (known limitation); the in-memory throttler is per process.
- **Neutral**: the frontend must keep the access token in memory (or another XSS-resistant store) and handle refresh.

---

## ADR-004: Pessimistic row locking and a sequences table

**Date**: 2026-10-02
**Status**: Accepted
**Deciders**: Project owner / @backend-developer

### Context
Checkout, purchase receipt and stock counts must never oversell, double-count or leave partial data (BR1, BR3, NF4), and invoice numbers must be unique under concurrent sales on a single MySQL instance.

### Options Considered
1. **Optimistic concurrency (version column, retry)**: Pros: no lock waits. Cons: retries leak into UX; harder to reason about for multi-row carts.
2. **Atomic `UPDATE ... WHERE stock_qty >= ?` only**: Pros: simple. Cons: no consistent price/cost snapshot, harder multi-line error reporting.
3. **Pessimistic locking with `SELECT ... FOR UPDATE` in one transaction**, plus a `document_sequences` table for numbering.
4. **`MAX(invoice_no)+1` or auto-increment for numbers**: Pros: trivial. Cons: race-prone, or the daily format is lost.

### Decision
Option 3. Product rows are locked in ascending id order (deadlock avoidance); the purchase row is locked and its status re-checked before receiving. Document numbers (`HD`/`PN`/`KK` + store-day + 4-digit sequence; `KH` + 6-digit global) come from `document_sequences`, incremented inside the business transaction with `INSERT ... ON DUPLICATE KEY UPDATE` followed by a locking read (the upsert avoids the shared-to-exclusive lock upgrade deadlock of `INSERT IGNORE` + `SELECT FOR UPDATE`). Lock order is products -> sequence -> customer. A DB `CHECK (stock_qty >= 0)` backs the application check.

### Consequences
- **Positive**: oversell and double receive are impossible; gap-free, concurrency-safe numbers; clear, deterministic error reporting (`INSUFFICIENT_STOCK` lists current availability).
- **Negative**: concurrent checkouts touching the same product (or the same day's invoice sequence) serialise; at the SRS's scale (10 users) this is negligible, but a hot product or a much larger store may need revisiting.
- **Neutral**: a rolled-back transaction returns its number, so numbers are gap-free.

---

## ADR-005: Defaults for the SRS open questions

**Date**: 2026-10-02
**Status**: Accepted
**Deciders**: Project owner (defaults) / @backend-developer

### Context
SRS section 4.1 lists questions for the store owner: points rule, maximum discount and who approves it, whether weighed goods/batches/returns are needed, which payment methods, and the invoice number format. Development cannot wait for answers, and the values must be easy to change.

### Options Considered
1. Block until the owner answers. Cons: delays everything.
2. Hard-code assumptions. Cons: changing them needs a code change.
3. Implement the SRS defaults, make them configuration, and document them as pending confirmation.

### Decision
Option 3, with these defaults:
- **Points (BR6)**: 1 point per 10,000 VND of the amount actually paid (`total`), rounded down; added only when a customer is attached, in the checkout transaction; no redemption. Env `POINTS_PER_VND` (default 10000).
- **Discount (BR7)**: one invoice-level whole-VND `discountAmount`, `0 <= discount < subtotal` so the total is always positive. Maximum as % of subtotal by role: cashier 10 % (`MAX_DISCOUNT_PERCENT_CASHIER`), admin 100 % but still `< subtotal` (`MAX_DISCOUNT_PERCENT_ADMIN`). There is no separate approval step: a cashier can only discount within their cap and an admin must ring larger discounts. Allocated to lines proportionally in whole VND, the last line taking the remainder.
- **Payment methods**: `CASH`, `CARD`, `TRANSFER`, `OTHER`, recorded only (no gateway). Split payments allowed; the amounts must sum exactly to the total; cash records tendered amount and change.
- **Invoice number**: `HD` + yyyyMMdd (Asia/Ho_Chi_Minh day) + 4-digit daily sequence, e.g. `HD202610020001`; purchases `PN...`, stock counts `KK...`, customers `KH` + 6 digits.
- **Out of scope for v1** (as in the SRS): weighed goods (whole units only, columns are DECIMAL(12,3) so this can be enabled later), batches/expiry, returns/refunds and sale cancellation (BR2), promotions.
- **Data retention / backup**: no retention policy implemented; daily MySQL backup is a tracked follow-up (NF7).

### Consequences
- **Positive**: working system now; each policy is an env var or one function.
- **Negative**: values may change after the owner confirms; changing the invoice format later affects only new documents.
- **Neutral**: the open questions stay on the backlog until the owner answers.

---

## ADR-006: Money and quantities as DECIMAL, whole units in v1

**Date**: 2026-10-02
**Status**: Accepted
**Deciders**: Project owner / @backend-developer

### Context
BR4/BR5 and section 7.3 require exact money arithmetic (no floating point), DECIMAL storage, and leave room for weighed goods later while v1 sells whole units only.

### Options Considered
1. JS numbers with rounding. Cons: floating-point error in sums, margins and allocation.
2. Integer minor units (VND, no sub-unit). Cons: conflicts with the SRS `DECIMAL(12,2)` schema and a future decimal quantity.
3. `Prisma.Decimal` (decimal.js) in code, `DECIMAL(12,2)` money and `DECIMAL(12,3)` quantities in MySQL.

### Decision
Option 3. All arithmetic uses `Decimal`; inputs are validated numbers with at most 2 decimals; quantities are validated as whole numbers both in DTOs and in the service (so enabling decimals later is a service change only). Responses serialise Decimals as JSON numbers via one interceptor (VND amounts are far below 2^53) so the frontend needs no string parsing. Timestamps are stored in UTC; reporting uses the fixed `+07:00` offset.

### Consequences
- **Positive**: exact totals, allocation and weighted-average cost; schema ready for weighed goods.
- **Negative**: one global interceptor walks every response; very large amounts (> 2^53) would lose precision in JSON (not realistic for this domain).
- **Neutral**: weighted-average cost is rounded half up to 2 decimals.

---

## ADR-007: Stockkeeper product permission and the single permission matrix

**Date**: 2026-10-02
**Status**: Accepted
**Deciders**: Project owner (defaults) / @backend-developer

### Context
SRS section 8 states that the stockkeeper's "manage products" right and an admin's ability to sell are proposals that the store owner must confirm. Role rules must be easy to change.

### Options Considered
1. Scatter `@Roles(...)` literals across controllers. Cons: changes require hunting through files.
2. A single permission map that controllers reference.

### Decision
Option 2: `PERMISSIONS` in `src/common/permissions/permissions.ts`, consumed via `@Roles(...PERMISSIONS.X)`; a global deny-by-default `RolesGuard` enforces it and logs denials. Defaults: ADMIN does everything including selling; STOCKKEEPER may create/update/deactivate categories and products, manage suppliers and purchases, count stock, and see the inventory report, but cannot sell or manage customers; CASHIER may sell and manage customers, read the catalog and see current stock (no cost, movements or low-stock alerts). `costPrice` is hidden from cashiers. An e2e test walks the whole matrix.

### Consequences
- **Positive**: one place to change a role rule; the matrix is also covered by tests.
- **Negative**: permissions are role-level only (no per-user overrides).
- **Neutral**: if the owner removes the stockkeeper's product rights, change `CATALOG_WRITE` and update the e2e matrix.

---

## ADR-008: One response envelope for success and errors, centralised error mapping

**Date**: 2026-10-02
**Status**: Accepted
**Deciders**: Project owner (reviewer feedback) / @backend-developer

### Context
Review feedback: clients need a single, reliable response format, and infrastructure failures (deadlocks, DB outages, CHECK violations, malformed requests) must not degrade into opaque 500s. Scattering try/catch through controllers and services was rejected: it duplicates logic and hides errors.

### Options Considered
1. **try/catch per handler/service**: Pros: local control. Cons: duplication, inconsistent bodies, swallowed errors.
2. **Envelope only for errors (current filter), raw payloads on success**: Pros: smaller bodies. Cons: clients must branch on shape; lists use a different top-level shape.
3. **Global interceptor + global filter producing one envelope** (`success`, `statusCode`, `code`, `message`, `data`, `meta?`/`details?`, `requestId`, `timestamp`), with a retry helper as the only deliberate try/catch.

### Decision
Option 3. `ResponseEnvelopeInterceptor` wraps every success (lists via an explicit `Paginated` marker class mapped to `data` + `meta`); `AllExceptionsFilter` maps every error, including Fastify-level ones and DB/infra failures. Real HTTP status codes are kept; operations that returned 204 now return 200 with `data: null`. Swagger UI/JSON are not wrapped and the docs describe the envelope with `ApiOkEnvelope` / `ApiPaginatedEnvelope`. Write transactions retry on deadlock/lock-wait (3 attempts, jitter) then answer 409 `TRANSACTION_CONFLICT`. Transaction timeout (P2028) maps to **503** `TRANSACTION_TIMEOUT` (server-side inability to finish in time, safe to retry) rather than 409, which is reserved for conflicts with other users' data. DB unreachable -> 503 `SERVICE_UNAVAILABLE`; CHECK violation -> 422 `CONSTRAINT_VIOLATION`. Validation messages are translated to Vietnamese centrally.

### Consequences
- **Positive**: one shape for clients to parse; consistent `requestId` for support; no accidental 500s for known DB conditions; one place to extend mapping.
- **Negative**: every payload is nested under `data` (breaking change vs the earlier unwrapped bodies); Swagger models for `data` are generic objects for endpoints that return Prisma payload types.
- **Neutral**: the legacy `error` (status text) field was dropped from error bodies.

---

## ADR-009: Structured JSON logging with pino and refresh-token reuse detection

**Date**: 2026-10-02
**Status**: Accepted
**Deciders**: Project owner (review feedback) / @backend-developer

### Context
Production support needs logs that can be searched by request, user and error code, with usable stack traces, and that never contain secrets. Separately, ADR-003 accepted that replaying an already-rotated refresh token merely failed; a stolen token that is replayed after the legitimate client rotated it should instead end the session.

### Options Considered
1. **Keep Nest's built-in text logger**: Pros: no dependency. Cons: unstructured lines, no per-request context, redaction by hand.
2. **winston/bunyan**: Pros: familiar. Cons: slower, no first-class Nest request-context integration.
3. **`nestjs-pino` (pino + pino-http)**: Pros: JSON by default, fast, built-in redaction, request-scoped child loggers via AsyncLocalStorage, routes existing `Logger` calls through pino. Cons: one more dependency set; `pino-pretty` needed for readable dev output.

For tokens: (a) do nothing; (b) store a token *family* table and revoke the family; (c) keep the previous hash on the session row and revoke the session when it is presented.

### Decision
Option 3 for logging: JSON lines on stdout carrying `requestId` (the inbound `X-Request-Id` or a generated UUID, the same id as the response envelope), `userId` and `role` when authenticated, method, route pattern and response time; authorization/cookie headers, `password`, `refreshToken` and `accessToken` are redacted and request bodies are never logged; `pino-pretty` only when `NODE_ENV=development`; the app is started with `node --enable-source-maps` so stack frames point at `.ts` lines. The exception filter logs 5xx at `error` with the stack, domain errors (any `AppException`, 409, 422) at `warn` with code and route, and other client errors (validation 400, 404) at `debug`.

Option (c) for tokens: `user_sessions.previous_refresh_token_hash` (nullable, unique) holds the hash replaced by the last rotation. A refresh with an unknown current token whose hash equals some session's previous hash revokes that session and logs a warning. A separate `@nestjs/schedule` job deletes sessions expired or revoked more than `SESSION_RETENTION_DAYS` ago, so the table stays small.

### Consequences
- **Positive**: searchable, safe logs; a replayed refresh token ends the session instead of silently failing; the session table cannot grow without bound.
- **Negative**: only one generation of history is kept (older stolen tokens just fail); a legitimate client that retries a refresh with an old token (for example two tabs refreshing at once) can be logged out and must sign in again; log volume is higher because every request writes a completion line.
- **Neutral**: supersedes the "re-use of a rotated token simply fails" consequence of ADR-003. The throttler is still in-memory; a shared store remains open in task #006 before running several instances.

---

<!--
TEMPLATE FOR NEW ADRs — copy this block when adding a new record:

## ADR-[NNN]: [Short Title]

**Date**: YYYY-MM-DD
**Status**: Accepted
**Deciders**: [Human name(s)] / @systems-architect

### Context
[What situation or problem prompted this decision. Include relevant constraints.]

### Options Considered
1. **[Option A]**: [Description] — Pros: [...] Cons: [...]
2. **[Option B]**: [Description] — Pros: [...] Cons: [...]

### Decision
[What was decided and the primary reason why.]

### Consequences
- **Positive**: [What becomes easier or better]
- **Negative**: [Trade-offs or what becomes harder]
- **Neutral**: [What changes but is neither better nor worse]
-->
