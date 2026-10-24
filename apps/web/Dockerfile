# Web app image and its database-migration image. Built on the VM by deploy.yml (context = repository root) and in CI
# as a check:
#   docker build -f apps/web/Dockerfile -t extas-web:<sha> .                    the app (last stage, `run`)
#   docker build -f apps/web/Dockerfile --target migrate -t extas-migrate:<sha> . schema migrations + settings and auth sync
# PR 17 (CN-023): CI builds the app once, here; the device gate, Lighthouse and the session end to end run the
# standalone output copied out of the app image. CI also brings the Next.js build cache (apps/web/.next/cache, kept by
# actions/cache; .dockerignore lets only that folder of .next in) and takes the updated one back out with
#   docker build -f apps/web/Dockerfile --target next-cache --output type=local,dest=<dir> .
# The VM's deploy checks out clean, so it has no cache folder and builds exactly as before.
FROM node:22-bookworm-slim AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH NEXT_TELEMETRY_DISABLED=1 COREPACK_ENABLE_DOWNLOAD_PROMPT=0
# Prisma's engines need libssl (the slim image has none).
RUN apt-get update -qq && apt-get install -y -qq --no-install-recommends openssl ca-certificates >/dev/null \
  && rm -rf /var/lib/apt/lists/*
RUN corepack enable
WORKDIR /repo

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY apps/web/package.json apps/web/
COPY packages/settings/package.json packages/settings/
COPY packages/vault/package.json packages/vault/
COPY packages/auth/package.json packages/auth/
COPY packages/seed/package.json packages/seed/
COPY packages/adapters/package.json packages/adapters/
COPY packages/media/package.json packages/media/
COPY packages/catalogue/package.json packages/catalogue/
COPY packages/inventory/package.json packages/inventory/
COPY packages/rules/package.json packages/rules/
COPY packages/combos/package.json packages/combos/
COPY packages/cart/package.json packages/cart/
COPY packages/checkout/package.json packages/checkout/
COPY packages/accounts/package.json packages/accounts/
COPY packages/delivery/package.json packages/delivery/
COPY packages/jobs/package.json packages/jobs/
COPY packages/metrics/package.json packages/metrics/
COPY packages/messages/package.json packages/messages/
COPY packages/orders/package.json packages/orders/
COPY packages/payments/package.json packages/payments/
COPY packages/search/package.json packages/search/
# @extas/db generates the Prisma client on install, so its schema and CLI wrapper come in with the manifests.
COPY packages/db/package.json packages/db/
COPY packages/db/scripts packages/db/scripts
COPY packages/db/prisma packages/db/prisma
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile

FROM deps AS build
COPY . .
ARG GIT_SHA=""
ENV GIT_SHA=$GIT_SHA
# The build type-checks against the full Prisma client (about 3 GB of heap), above Node's default limit.
RUN NODE_OPTIONS=--max-old-space-size=4096 pnpm status:gen && NODE_OPTIONS=--max-old-space-size=4096 pnpm --filter @extas/web build

# CI only (never a deploy target): the build's Next.js cache (Turbopack's file-system cache), for the next run.
FROM scratch AS next-cache
COPY --from=build /repo/apps/web/.next/cache /

# Runs once per deploy, before the new colour starts (infra/deploy/deploy.sh): `prisma migrate deploy` straight to
# PostgreSQL (DATABASE_DIRECT_URL), then the settings migration (PR 496), then the auth sync (PR 16/495: permission
# catalogue + owner role), then the sample gazetteer (PR 549; only while no real national list has been imported), then
# the mother store of a fresh installation and the general default pack on every store (PR 508; both add only what
# is missing). Needs no app build. The same image holds the owner set-up command (packages/auth, cli.ts create-owner)
# and runs the background worker (PR 6: packages/jobs, `tsx src/main.ts`; infra/stack/app.yml `worker`).
FROM deps AS migrate
COPY packages/ packages/
ARG GIT_SHA=""
ENV GIT_SHA=$GIT_SHA NODE_ENV=production PRISMA_HIDE_UPDATE_MESSAGE=1
USER node
WORKDIR /repo/packages/settings
CMD ["sh", "-c", "cd /repo/packages/db && node scripts/prisma.mjs migrate deploy && cd /repo/packages/settings && ./node_modules/.bin/tsx src/cli.ts sync && cd /repo/packages/auth && ./node_modules/.bin/tsx src/cli.ts sync && cd /repo/packages/delivery && ./node_modules/.bin/tsx src/cli.ts import --deploy && cd /repo/packages/seed && ./node_modules/.bin/tsx src/cli.ts mother-store && exec ./node_modules/.bin/tsx src/cli.ts pack --all-stores"]

FROM node:22-bookworm-slim AS run
# sharp (PR 22) brings its own libvips (@img/sharp-linux-x64, traced into the standalone output); the watermark on the
# download copy (PR 23) draws text, which needs fonts the slim image lacks: Latin (DejaVu) and Bengali (Lohit).
RUN apt-get update -qq && apt-get install -y -qq --no-install-recommends openssl ca-certificates \
    fontconfig fonts-dejavu-core fonts-lohit-beng-bengali >/dev/null \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
COPY --from=build --chown=node:node /repo/apps/web/.next/standalone ./
COPY --from=build --chown=node:node /repo/apps/web/.next/static ./apps/web/.next/static
COPY --from=build --chown=node:node /repo/apps/web/public ./apps/web/public
ARG GIT_SHA=""
ENV GIT_SHA=$GIT_SHA
USER node
EXPOSE 3000
HEALTHCHECK --interval=5s --timeout=3s --start-period=10s --retries=6 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]
CMD ["node", "apps/web/server.js"]
