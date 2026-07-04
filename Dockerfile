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
FROM node:20-slim AS runtime
WORKDIR /app

# Create non-root user for security
RUN groupadd --system --gid 1001 appgroup && \
    useradd --system --uid 1001 --gid appgroup appuser

# Install only production dependencies
COPY package*.json ./
RUN npm ci --omit=dev && \
    npm cache clean --force

# Copy built assets from builder stage
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/server.ts ./server.ts
COPY --from=builder /app/src ./src
COPY --from=builder /app/tsconfig.json ./tsconfig.json
COPY --from=builder /app/schema.sql ./schema.sql

# Switch to non-root user
USER appuser

EXPOSE 3000

# Healthcheck: verify the server responds on /api/auth/me (returns 401 if up)
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://localhost:3000/api/auth/me').then(r=>process.exit(r.status===401||r.status===200?0:1)).catch(()=>process.exit(1))"

# Run with tsx (TypeScript runtime) since the server is TS.
# In production, prefer pre-compiling to JS and running with node directly.
CMD ["npx", "tsx", "server.ts"]
