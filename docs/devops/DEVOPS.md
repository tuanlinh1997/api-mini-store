# DevOps

> Owner: @cicd-engineer (environments, pipeline, deployment, rollback, monitoring). The **Containers** section is owned by @docker-expert.
> No CI/CD pipeline exists yet; those sections are placeholders for @cicd-engineer.

## Environments

| Environment | How it runs | Database |
|-------------|-------------|----------|
| Local development | `npm run start:dev` on the host | MySQL from `docker compose up -d mysql` (or any MySQL 8) |
| Local container stack | `docker compose up -d --build` (api + migrate + mysql) | `mysql` compose service, named volume `mini_store_mysql` |
| Production | Not defined yet (@systems-architect / @cicd-engineer) | Managed or self-hosted MySQL 8.0.16+ |

## CI/CD, deployment, rollback, monitoring

_To be written by @cicd-engineer._ When CI builds the image: tag `sha-<8 chars>` per commit and `vX.Y.Z` per release, never deploy `:latest`, and scan with Trivy/Scout, blocking on CRITICAL/HIGH.

---

## Containers

### Files

| File | Purpose |
|------|---------|
| `Dockerfile` | Multi-stage build: `base` -> `deps` (prod deps) / `build` (full deps, `prisma generate`, `nest build`) -> `migrate` (one-shot job) and `runtime` (final) |
| `docker-compose.yml` | `mysql` + `migrate` + `api` |
| `.dockerignore` | Keeps `node_modules`, `dist`, `.env*`, `.git`, `.claude`, `backups`, `coverage`, tests, docs out of the build context |

### Image design

- **Base**: `node:22-alpine3.22` (override with `--build-arg NODE_IMAGE=...`). Alpine is used because argon2 ships musl prebuilds and Prisma has a `linux-musl-openssl-3.0.x` engine; `openssl` is installed explicitly. `prisma generate` runs in the same base image, so the default `native` binary target matches the runtime and `schema.prisma` needs no `binaryTargets`. If the base is ever changed to a different libc/OpenSSL, regenerate in that image; still no schema change.
- **Runtime stage**: production dependencies only (`npm ci --omit=dev --ignore-scripts`), the generated Prisma client copied from the build stage, `dist/`, `tini` as PID 1, runs as the non-root `node` user (uid 1000).
- **Start command**: `node --enable-source-maps dist/main.js`.
- **Healthcheck**: `GET /api/v1/health` (checks database reachability), using Node's built-in `fetch`, so no curl/wget is needed. Interval 30s, start period 20s.
- **Compose hardening on `api`**: read-only root filesystem with `/tmp` as tmpfs, `cap_drop: ALL`, `no-new-privileges`, 1 CPU / 512 MB limit, json-file log rotation. The app logs to stdout/stderr only.
- **Known size note**: the runtime image is about 445 MB because npm installs `prisma` and `typescript` into production `node_modules` (about 75 MB combined); this is a dependency-graph matter in `package.json`, not the Dockerfile.

### Running

```bash
cp .env.example .env              # set JWT_ACCESS_SECRET (>= 32 chars) and review the rest
docker compose up -d --build      # mysql -> migrate (one-shot) -> api
docker compose ps
curl http://localhost:3000/api/v1/health
docker compose logs -f api
docker compose down               # keep data  |  docker compose down -v  = also delete the database volume
docker compose up -d mysql        # database only, for `npm run start:dev` on the host
```

### Migrations

`prisma migrate deploy` is run by the one-shot `migrate` compose service (built from the Dockerfile `migrate` target, which contains the Prisma CLI). The `api` service waits for `migrate` to exit successfully (`service_completed_successfully`) and for MySQL to be healthy, so the schema is always current before the API accepts traffic. The runtime image deliberately does not contain the Prisma CLI.

Outside compose (for example a release job on another platform), run the same image target before starting the new `api` version:

```bash
docker build --target migrate -t mini-store-api-migrate .
docker run --rm -e DATABASE_URL=... mini-store-api-migrate
```

Migrations are applied only forward; rollback means shipping a new corrective migration (see `docs/database/DATABASE.md`).

### Seeding (manual only, never automatic)

Neither the base seed nor the demo seed runs as part of the stack. Run them explicitly against a development database from a host checkout (`npm run prisma:seed`, `npm run seed:demo -- --reset`) with `DATABASE_URL` pointing at the published MySQL port, or in a one-off container:

```bash
docker compose run --rm --no-deps -e DATABASE_URL=mysql://root:@mysql:3306/mini_store migrate npm run prisma:seed
```

(The `migrate` image has the dev dependencies and `prisma/` the seed needs; pass the `SEED_*` passwords via `-e` or `--env-file .env`. This one-off container seed command has not been run; the host-checkout route is the tested one.) The demo seed refuses `NODE_ENV=production` and must never be used on a production database.

### Environment variables

The `api` service loads `.env` (`env_file`); the values below are overridden by compose. See `docs/backend/BACKEND.md` for the full application variable list.

| Variable | Used by | Default | Description |
|----------|---------|---------|-------------|
| `JWT_ACCESS_SECRET` | api | required | >= 32 chars, from `.env`; never committed |
| `DATABASE_URL` | api, migrate | built by compose | `mysql://root:${MYSQL_ROOT_PASSWORD}@mysql:3306/${MYSQL_DATABASE}`; the value in `.env` (usually `127.0.0.1`) is overridden inside compose |
| `NODE_ENV`, `HOST`, `PORT` | api | `production`, `0.0.0.0`, `3000` | Fixed by compose; the container always listens on 3000 |
| `API_PORT` | compose | `3000` | Host port mapped to the API |
| `MYSQL_DATABASE` | mysql, api, migrate | `mini_store` | Database created on first start |
| `MYSQL_ROOT_PASSWORD` | mysql, api, migrate | empty | Empty = passwordless root (throwaway local use only). Set a strong, URL-safe value for anything shared; only takes effect on first initialisation of the volume |
| `MYSQL_ALLOW_EMPTY_PASSWORD` | mysql | `yes` | Set to `no` together with a root password |
| `MYSQL_PORT` | compose | `3306` | Host port for MySQL, bound to 127.0.0.1 only |
| All others in `.env.example` | api | see file | `CORS_ORIGINS`, `SWAGGER_ENABLED`, `TRUST_PROXY`, throttling, business rules, receipt |

Secrets live only in `.env` / the platform secret store; `.env*` is excluded from the build context and git.

### Debugging

```bash
docker compose exec api sh                 # shell in the running API container
docker compose logs --tail 100 -f api      # live logs
docker compose run --rm migrate            # re-run migrations manually
docker stats                               # resource usage
docker compose build --no-cache api        # rebuild without cache
docker compose down -v && docker compose up -d --build   # fresh database
```

### Verification status

Last verified 2026-10-02 on Docker Desktop (linux, local): `docker build --target runtime` succeeds; `docker compose up -d --build` starts mysql, `migrate` applies the init migration and exits 0, `api` becomes `healthy` and `GET /api/v1/health` returns 200 with `database: up`; the container runs as uid 1000.
Not yet done: vulnerability scan (`docker scan`/Trivy), multi-arch (`linux/arm64`) build, image build in CI.
