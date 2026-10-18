# syntax=docker/dockerfile:1
FROM node:22-alpine AS base
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
RUN apk add --no-cache gcompat
RUN npm install --global pnpm@10.18.3

FROM base AS dependencies
COPY package.json pnpm-lock.yaml ./
RUN --mount=type=cache,id=runly-pnpm,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile --ignore-scripts

FROM dependencies AS builder
# These are public configuration only. Server secrets are supplied at runtime.
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
ARG RUNLY_RUNTIME_GATEWAYS=[]
ARG RUNLY_PREVIEW_DOMAIN
ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL \
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=$NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY \
    RUNLY_RUNTIME_GATEWAYS=$RUNLY_RUNTIME_GATEWAYS \
    RUNLY_PREVIEW_DOMAIN=$RUNLY_PREVIEW_DOMAIN
COPY . .
RUN pnpm build

FROM node:22-alpine AS runtime-base
WORKDIR /app
# The production processes run bundled code and never install project packages.
# Keep build/package-manager tooling out of their runtime filesystem.
RUN apk upgrade --no-cache && apk add --no-cache gcompat \
    && rm -rf /usr/local/lib/node_modules /opt/yarn* \
    && rm -f /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack \
       /usr/local/bin/yarn /usr/local/bin/yarnpkg

FROM runtime-base AS web
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 HOSTNAME=127.0.0.1 PORT=3000
COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static
COPY --from=builder --chown=node:node /app/public ./public
COPY --from=builder --chown=node:node /app/content/legal ./content/legal
RUN mkdir -p .next/cache && chown node:node .next/cache
USER node
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s \
    CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server.js"]

FROM dependencies AS worker-builder
COPY runtime/gateway.ts runtime/reconcile.ts runtime/bridge.py ./runtime/
COPY src/lib/runtime/shared.ts ./src/lib/runtime/shared.ts
COPY scripts/build-worker.mjs ./scripts/build-worker.mjs
RUN pnpm build:worker

FROM runtime-base AS worker
WORKDIR /app
ENV NODE_ENV=production RUNLY_RUNTIME_PORT=4001
COPY --from=worker-builder --chown=node:node /app/dist/runtime ./runtime
USER node
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s \
    CMD node -e "fetch('http://127.0.0.1:4001/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "runtime/gateway.mjs"]

FROM nginx:stable-alpine AS proxy
RUN apk upgrade --no-cache
COPY deploy/nginx.conf.template /etc/nginx/runly.conf.template
COPY deploy/proxy-entrypoint.sh /usr/local/bin/runly-proxy
USER 101:101
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
    CMD wget -q -O /dev/null http://127.0.0.1:8081/health || exit 1
ENTRYPOINT ["/bin/sh", "/usr/local/bin/runly-proxy"]
