# syntax=docker/dockerfile:1.7
#
# Mini Store API image. See docs/devops/DEVOPS.md.
#
# Base: Alpine (musl). argon2 ships musl prebuilds and Prisma has a linux-musl-openssl-3.0.x engine.
# `prisma generate` runs inside this same base image, so the default "native" binary target always
# matches the runtime and no `binaryTargets` entry is needed in schema.prisma.
ARG NODE_IMAGE=node:22-alpine3.22

# ---- base: OS packages shared by every stage -------------------------------------------------------
FROM ${NODE_IMAGE} AS base
# Prisma's engines need OpenSSL at runtime (not shipped in node:alpine); tini forwards signals and reaps zombies.
RUN apk add --no-cache openssl tini
WORKDIR /app

# ---- deps: production dependencies only ------------------------------------------------------------
FROM base AS deps
COPY package.json package-lock.json ./
# --ignore-scripts: @prisma/client's postinstall would try to generate without a schema; the generated
# client is copied from the build stage instead. argon2 loads its prebuilt binary without install scripts.
RUN --mount=type=cache,target=/root/.npm \
    npm ci --omit=dev --ignore-scripts

# ---- build: all dependencies, prisma generate, nest build ------------------------------------------
FROM base AS build
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm \
    npm ci
COPY prisma ./prisma
RUN npx prisma generate
COPY nest-cli.json tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN npm run build

# ---- migrate: one-shot job image (needs the prisma CLI, a devDependency) ----------------------------
# Runs `prisma migrate deploy` (used by the `migrate` compose service). Never runs the seed.
FROM build AS migrate
ENV NODE_ENV=production
USER node
CMD ["npx", "prisma", "migrate", "deploy"]

# ---- runtime: minimal, non-root --------------------------------------------------------------------
FROM base AS runtime
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000
COPY --from=deps /app/node_modules ./node_modules
# Generated Prisma client + query engine for this exact OS/OpenSSL
COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=build /app/dist ./dist
COPY package.json ./
# The built-in `node` user (uid 1000) is non-root; code stays root-owned and not writable by it.
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/v1/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "--enable-source-maps", "dist/main.js"]
