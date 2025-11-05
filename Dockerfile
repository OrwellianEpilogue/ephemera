# Multi-stage Dockerfile for ephemera
# Simplified single-process architecture: Node.js serves both API and static files

# Stage 1: Dependencies and Build Environment
FROM node:22-alpine AS build-env

# Install build dependencies for native modules (better-sqlite3)
RUN apk add --no-cache python3 make g++ gcc musl-dev

# Enable corepack for pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /build

# Copy workspace config and all package source code
# .dockerignore will exclude node_modules/ and dist/ automatically
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/ ./packages/

# Install all dependencies (including devDependencies for build)
# This creates proper workspace symlinks
RUN pnpm install --frozen-lockfile

# Build all packages sequentially to ensure proper dependency resolution
# Use tsc --build --force to ensure clean builds (no stale incremental data)
RUN cd packages/shared && npx tsc --build --force && cd ../.. && \
    cd packages/api && npx tsc --build --force && cd ../.. && \
    cd packages/web && npx tsc && npx vite build

# Stage 2: Production Dependencies
FROM node:22-alpine AS prod-deps

# Install build dependencies for native modules
RUN apk add --no-cache python3 make g++ gcc musl-dev

RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

# Copy package files and source before install (for workspace resolution)
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/ ./packages/

# Install only production dependencies
RUN pnpm install --frozen-lockfile --prod

# Force rebuild better-sqlite3 with node-gyp
RUN cd /app/node_modules/.pnpm/better-sqlite3@11.10.0/node_modules/better-sqlite3 && \
    npm run build-release

# Stage 3: Production Runtime
FROM node:22-alpine AS runtime

# Install packages needed for PUID/PGID support
RUN apk add --no-cache shadow su-exec

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

WORKDIR /app

# Copy production dependencies (includes rebuilt native modules)
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=prod-deps /app/packages/shared/node_modules ./packages/shared/node_modules
COPY --from=prod-deps /app/packages/api/node_modules ./packages/api/node_modules

# Copy built artifacts
COPY --from=build-env /build/packages/shared/dist ./packages/shared/dist
COPY --from=build-env /build/packages/shared/package.json ./packages/shared/
COPY --from=build-env /build/packages/api/dist ./packages/api/dist
COPY --from=build-env /build/packages/api/package.json ./packages/api/
COPY --from=build-env /build/packages/api/src/db ./packages/api/src/db
COPY --from=build-env /build/packages/web/dist ./packages/web/dist

# Copy package files
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

# Copy entrypoint script
COPY docker-entrypoint.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/docker-entrypoint.sh


# Note: Container starts as root to allow PUID/PGID modification
# Entrypoint script will drop privileges to nodejs user via su-exec

# Expose application port (default 8286)
EXPOSE 8286

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:${PORT:-8286}/health || exit 1

# Set entrypoint
ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
