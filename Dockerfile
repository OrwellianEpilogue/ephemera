# Multi-stage Dockerfile for ephemera
# Simplified single-process architecture: Node.js serves both API and static files
# Uses Debian slim instead of Alpine for Calibre compatibility (glibc required)

# Stage 1: Dependencies and Build Environment
# Pin to 22.16.0 - Node 22.21.x has undici fetch bug (SyntaxError in connect)
FROM node:22.16.0-slim AS build-env

# Install build dependencies for native modules (better-sqlite3)
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ gcc && \
    rm -rf /var/lib/apt/lists/*

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
FROM node:22.16.0-slim AS prod-deps

# Install build dependencies for native modules
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ gcc && \
    rm -rf /var/lib/apt/lists/*

RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

# Copy package files and source before install (for workspace resolution)
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/ ./packages/

# Approve better-sqlite3 build script before install
RUN pnpm config set enable-pre-post-scripts false

# Install only production dependencies (ignore scripts to skip husky)
RUN pnpm install --frozen-lockfile --prod --ignore-scripts

# Force rebuild better-sqlite3 with node-gyp
# Find the better-sqlite3 package and run build-release
RUN SQLITE_PATH=$(find /app/node_modules/.pnpm -type d -path "*/better-sqlite3@*/node_modules/better-sqlite3" | head -n 1) && \
    if [ -n "$SQLITE_PATH" ]; then \
        cd "$SQLITE_PATH" && npm run build-release; \
    fi

# Stage 3: Production Runtime
FROM node:22.16.0-slim AS runtime

# Install runtime dependencies:
# - gosu: for PUID/PGID support (replaces su-exec on Alpine)
# - wget + ca-certificates: for healthcheck and Calibre installer
# - Calibre dependencies: required libraries for ebook-convert
RUN apt-get update && apt-get install -y --no-install-recommends \
    gosu wget ca-certificates xz-utils python3 \
    libegl1 libopengl0 libxcb-cursor0 libfreetype6 \
    libfontconfig1 libgl1 libxkbcommon0 libdbus-1-3 && \
    rm -rf /var/lib/apt/lists/*

# Install Calibre CLI tools (works on both amd64 and arm64)
# The official installer auto-detects architecture
RUN wget -nv -O- https://download.calibre-ebook.com/linux-installer.sh | sh /dev/stdin install_dir=/opt

# Create non-root user
RUN groupadd -g 1001 nodejs && \
    useradd -u 1001 -g nodejs -s /bin/sh nodejs

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


# Set Calibre path for ebook-convert
ENV CALIBRE_PATH=/opt/calibre

# Note: Container starts as root to allow PUID/PGID modification
# Entrypoint script will drop privileges to nodejs user via gosu

# Expose application port (default 8286)
EXPOSE 8286

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:${PORT:-8286}/health || exit 1

# Set entrypoint
ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
