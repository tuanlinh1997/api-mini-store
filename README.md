# Mini Store API

Backend REST API for the mini-supermarket management web app ("Quản lý siêu thị mini"): login and roles, products/categories/suppliers, purchasing with stock receipt, POS checkout and receipts, customers with loyalty points, inventory and stock counts, and sales/profit/inventory reports.

**Stack**: NestJS 11 (Fastify adapter) · TypeScript (strict) · MySQL 8 · Prisma 6 · JWT + database sessions · Jest + supertest.

## Quick start

Requirements: Node 22+, npm 10+, MySQL 8.0.16+ (or `docker compose up -d mysql`).

```bash
npm install
cp .env.example .env            # set DATABASE_URL and a strong JWT_ACCESS_SECRET
npx prisma migrate deploy       # create the schema
npm run prisma:seed             # admin + demo users and a small sample catalog
# optional: ~90 days of realistic data in every table (dev database only)
npm run seed:demo -- --reset && npm run seed:demo:verify
npm run start:dev
```

- API: `http://localhost:3000/api/v1` (health check: `GET /api/v1/health`)
- Swagger UI: `http://localhost:3000/api/docs` · API contract for frontend: [`docs/backend/openapi.json`](docs/backend/openapi.json), [`docs/backend/api-types.ts`](docs/backend/api-types.ts), guide (Vietnamese): [`docs/backend/api_integration_guide.md`](docs/backend/api_integration_guide.md)
- Seed logins: the admin from `SEED_ADMIN_USERNAME` / `SEED_ADMIN_PASSWORD`, plus `cashier` and `stockkeeper` with `SEED_DEMO_PASSWORD` (all values come from `.env`; use the example values only locally).

```bash
curl -s -X POST http://localhost:3000/api/v1/auth/login \
  -H 'content-type: application/json' \
  -d '{"username":"cashier","password":"<SEED_DEMO_PASSWORD>"}'
```

## Docker

```bash
cp .env.example .env                 # set JWT_ACCESS_SECRET; DATABASE_URL is overridden inside compose
docker compose up -d --build         # mysql -> one-shot `prisma migrate deploy` -> api on :3000
curl http://localhost:3000/api/v1/health
```

Migrations run automatically before the API starts; the seeds never do. Details (image design, env vars, debugging): [docs/devops/DEVOPS.md](docs/devops/DEVOPS.md).

## Scripts

| Command | What it does |
|---------|--------------|
| `npm run start:dev` | Dev server with watch |
| `npm run build` · `npm start` / `npm run start:prod` | Compile to `dist/`, run the build (with `--enable-source-maps`, JSON logs) |
| `npm run lint` · `npm run typecheck` | ESLint · TypeScript check |
| `npm test` | Unit tests (no database needed) |
| `npm run test:e2e` | E2E tests against a real MySQL database `mini_store_test` (migrations applied automatically; override with `TEST_DATABASE_URL`, name must end with `_test`) |
| `npm run prisma:migrate` | Create/apply a migration during development |
| `npm run prisma:deploy` | Apply committed migrations |
| `npm run prisma:seed` | Base seed: users and a small catalog (idempotent) |
| `npm run seed:demo -- --reset` | Fill every table with ~90 days of consistent demo data (dev DB only; refuses production/test DBs) |
| `npm run seed:demo:verify` | 24 PASS/FAIL consistency checks on the demo data (`-- --database-url=...` to check another database) |
| `npm run openapi:export` | Regenerate the API contract: `docs/backend/openapi.json` + `docs/backend/api-types.ts` (no database needed; commit both) |
| `npm run openapi:check` | Fail when the committed contract files are stale (CI) |
| `npm run db:backup` | Gzipped, timestamped `mysqldump` into `BACKUP_DIR` (default `./backups`), keeps the newest `BACKUP_RETENTION_COUNT` |
| `npm run db:restore -- --file=<backup> --target=<db>` | Restore a backup into another database (refuses the `DATABASE_URL` database and production without `--force`) |
| `npm run db:compare -- --source=<db> --target=<db>` | Compare row counts per table of two databases |

Create the databases once: `CREATE DATABASE mini_store CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;` and the same for `mini_store_test`. `docker-compose.yml` provides an optional MySQL 8 service (`mini_store` is created automatically).

## CI

`.github/workflows/ci.yml` runs on pull requests and on pushes to `main`, `master` and `feature/**`: lint + typecheck, unit tests (coverage uploaded as the `unit-coverage` artifact), build, e2e tests against a `mysql:8.0` service container (`mini_store_test`, utf8mb4), and a Prisma migration drift check. All credentials in the workflow are CI-only dummy values. Make the jobs required checks in the branch protection rules.

## Documentation

| Doc | Content |
|-----|---------|
| [docs/backend/API.md](docs/backend/API.md) | Every endpoint: roles, request, response, error codes |
| [docs/backend/BACKEND.md](docs/backend/BACKEND.md) | Module layout, auth flow, transactions/locking, numbering, logging, scheduled jobs, backup & restore runbook, configuration |
| [docs/database/DATABASE.md](docs/database/DATABASE.md) | Tables, constraints, indexes, ER diagram, migrations |
| [docs/architecture/DECISIONS.md](docs/architecture/DECISIONS.md) | Architecture decisions and the defaults chosen for the SRS open questions |

## Security notes

Bearer-token authentication (no cookies, so no CSRF surface), argon2id password hashing, sessions revocable instantly, deny-by-default role checks, strict login rate limiting, input whitelisting, parameterised SQL only, Helmet headers, CORS from `CORS_ORIGINS`. Never commit `.env`.
