# --- Stage 1: build the SPA ---
FROM node:20-slim AS builder
WORKDIR /app

# Install all workspace dependencies first (better layer caching).
COPY package.json package-lock.json ./
COPY apps/web/package.json apps/web/
COPY packages/contracts/package.json packages/contracts/
COPY packages/ui/package.json packages/ui/
COPY services/api/package.json services/api/
COPY services/domain/package.json services/domain/
COPY services/data/package.json services/data/
COPY services/integrations/package.json services/integrations/
COPY services/audit/package.json services/audit/
RUN npm ci

# Copy the workspace sources and build.
COPY tsconfig.base.json tsconfig.json ./
COPY apps apps
COPY packages packages
COPY services services
COPY e2e e2e
COPY playwright.config.ts vitest.config.ts eslint.config.js ./
# Prisma client needs a schema only; DATABASE_URL is validated at runtime,
# not at generate time.
RUN npx prisma generate --schema services/data/prisma/schema.prisma
RUN npm run build

# --- Stage 2: runtime ---
FROM node:20-slim AS runtime
WORKDIR /app

RUN groupadd --system --gid 1001 appgroup && \
    useradd --system --uid 1001 --gid appgroup appuser

# Production dependencies + tsx pinned locally (never downloaded at runtime).
COPY package.json package-lock.json ./
COPY apps/web/package.json apps/web/
COPY packages/contracts/package.json packages/contracts/
COPY packages/ui/package.json packages/ui/
COPY services/api/package.json services/api/
COPY services/domain/package.json services/domain/
COPY services/data/package.json services/data/
COPY services/integrations/package.json services/integrations/
COPY services/audit/package.json services/audit/
RUN npm ci --omit=dev && \
    npm install --no-save tsx@^4.21.0 && \
    npm cache clean --force

# Built SPA, server sources, shared packages and tooling configs.
COPY --from=builder /app/apps/web/dist ./apps/web/dist
COPY --from=builder /app/tsconfig.base.json ./tsconfig.base.json
COPY --from=builder /app/tsconfig.json ./tsconfig.json
COPY --from=builder /app/apps ./apps
COPY --from=builder /app/packages ./packages
COPY --from=builder /app/services ./services
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma

USER appuser

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://localhost:3000/api/v1/health').then(r=>process.exit(r.status===200?0:1)).catch(()=>process.exit(1))"

CMD ["./node_modules/.bin/tsx", "services/api/src/server.ts"]
