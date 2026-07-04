# --- Stage 1: Build ---
FROM node:20-slim AS builder
WORKDIR /app

# Install dependencies first (better layer caching)
COPY package*.json ./
RUN npm ci

# Copy source and build
COPY . .
RUN npm run build

# --- Stage 2: Runtime ---
# Use the official Node.js slim image (not a devcontainer image).
FROM node:20-slim AS runtime
WORKDIR /app

# Create non-root user for security
RUN groupadd --system --gid 1001 appgroup && \
    useradd --system --uid 1001 --gid appgroup appuser

# Install only production dependencies (tsx is in devDependencies, so we
# install it explicitly here to avoid `npx tsx` downloading from npm at runtime,
# which would be a supply chain risk).
COPY package*.json ./
RUN npm ci --omit=dev && \
    npm install --no-save tsx@^4.21.0 && \
    npm cache clean --force

# Copy built assets from builder stage
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/server.ts ./server.ts
COPY --from=builder /app/src ./src
COPY --from=builder /app/tsconfig.json ./tsconfig.json
COPY --from=builder /app/schema.sql ./schema.sql
COPY --from=builder /app/prisma ./prisma

# Switch to non-root user
USER appuser

EXPOSE 3000

# Healthcheck: verify the server responds on /api/health (no auth required)
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://localhost:3000/api/health').then(r=>process.exit(r.status===200?0:1)).catch(()=>process.exit(1))"

# Run with the locally-installed tsx (not npx, which would download from npm).
# In a future hardening pass, pre-compile server.ts to JS and run with node directly.
CMD ["./node_modules/.bin/tsx", "server.ts"]
