# syntax=docker/dockerfile:1.7

# ---- deps: install production + dev dependencies for build ----
FROM node:22-bookworm-slim AS deps
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm \
    npm ci --include=dev

# ---- builder: produce .next/standalone ----
FROM node:22-bookworm-slim AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

COPY --from=deps /app/node_modules ./node_modules
COPY . .

RUN npm run build

# ---- runner: minimal runtime image ----
FROM node:22-bookworm-slim AS runner
WORKDIR /app

# tini gives us proper PID-1 signal handling for graceful shutdown.
RUN apt-get update && apt-get install -y --no-install-recommends tini ca-certificates \
 && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    DATA_DIR=/app/data/data \
    BRANDS_DIR=/app/data/brands \
    CONFIG_DIR=/app/data/config \
    UPLOADS_DIR=/app/data/uploads

# Standalone output bundles only the production deps + node_modules subset Next traced.
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

# Source-of-truth seed copies. The entrypoint reconciles these onto the volume
# at /app/data on first boot (and never overwrites existing files unless asked).
COPY --from=builder /app/brands ./brands.seed
COPY --from=builder /app/config ./config.seed

# Entrypoint script lives outside the standalone bundle.
COPY --chmod=0755 scripts/entrypoint.sh ./scripts/entrypoint.sh

# /app/data is the volume mount target on Fly. Pre-create so the entrypoint
# doesn't need root to mkdir if the volume hasn't been initialized yet.
RUN mkdir -p /app/data && chown -R node:node /app

USER node

EXPOSE 3000

ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["./scripts/entrypoint.sh"]
