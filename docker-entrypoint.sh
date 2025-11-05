#!/bin/sh
set -e

echo "==================================="
echo "ephemera — book downloader"
echo "==================================="

if [ -z "$AA_BASE_URL" ]; then
  echo "ERROR: AA_BASE_URL is required but not set"
  exit 1
fi

# Handle PUID/PGID for permission management
# Set PUID if not set
if [ -z "$PUID" ]; then
    PUID=1000
fi

# Set PGID if not set
if [ -z "$PGID" ]; then
    PGID=100
fi

echo "Setting up user with PUID=$PUID and PGID=$PGID"

# Create group if it doesn't exist
GROUP_NAME="appgroup"
if ! getent group "$PGID" >/dev/null 2>&1; then
  echo "Creating group with GID=$PGID"
  addgroup -g "$PGID" "$GROUP_NAME"
else
  # Get existing group name for this GID
  GROUP_NAME=$(getent group "$PGID" | cut -d: -f1)
  echo "Using existing group: $GROUP_NAME (GID=$PGID)"
fi

# Create user if it doesn't exist
USER_NAME="appuser"
if ! id -u "$PUID" >/dev/null 2>&1; then
  echo "Creating user with UID=$PUID"
  adduser -u "$PUID" -G "$GROUP_NAME" -h /app -s /sbin/nologin -D "$USER_NAME"
else
  # Get existing username for this UID
  USER_NAME=$(getent passwd "$PUID" | cut -d: -f1)
  echo "Using existing user: $USER_NAME (UID=$PUID)"
fi

# Set Docker-friendly defaults (can be overridden by user)
export PORT="${PORT:-8286}"
export HOST="${HOST:-0.0.0.0}"
export NODE_ENV="${NODE_ENV:-production}"
export DB_PATH="${DB_PATH:-/app/data/database.db}"
export CRAWLEE_STORAGE_DIR="${CRAWLEE_STORAGE_DIR:-/app/data/.crawlee}"
export DOWNLOAD_FOLDER="${DOWNLOAD_FOLDER:-/app/downloads}"
export INGEST_FOLDER="${INGEST_FOLDER:-/app/ingest}"

# Create required directories (mounted volumes should already exist from host)
echo "Setting up directories..."
mkdir -p /app/data /app/downloads /app/ingest /app/data/.crawlee

# Note: We don't chown mounted volumes - they inherit permissions from the host
# The PUID/PGID should match your host user, so the container user can already access them

# Run database migrations as the application user
echo "Running database migrations..."
cd /app/packages/api
su-exec "$USER_NAME" node dist/db/migrate.js || echo "Warning: Migrations may have failed, continuing anyway..."

# Start the application
cd /app/packages/api
echo "Starting server on port $PORT..."
echo "Application will be available at http://localhost:$PORT"
echo "==================================="

# Run Node.js server as the application user
# The server handles graceful shutdown via SIGTERM/SIGINT handlers
exec su-exec "$USER_NAME" node dist/index.js
