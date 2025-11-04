#!/bin/sh
set -e

echo "==================================="
echo "ephemera — book downloader"
echo "==================================="

# Validate required environment variables
if [ -z "$AA_API_KEY" ]; then
  echo "ERROR: AA_API_KEY is required but not set"
  exit 1
fi

if [ -z "$AA_BASE_URL" ]; then
  echo "ERROR: AA_BASE_URL is required but not set"
  exit 1
fi

# Handle PUID/PGID for permission management
PUID=${PUID:-1001}
PGID=${PGID:-1001}

echo "Setting up user with PUID=$PUID and PGID=$PGID"

# Update nodejs user/group IDs to match PUID/PGID
if [ "$PUID" != "1001" ] || [ "$PGID" != "1001" ]; then
  echo "Updating user permissions..."

  # Modify group ID
  if [ "$PGID" != "1001" ]; then
    groupmod -o -g "$PGID" nodejs
  fi

  # Modify user ID
  if [ "$PUID" != "1001" ]; then
    usermod -o -u "$PUID" nodejs
  fi
fi

# Set Docker-friendly defaults (can be overridden by user)
export PORT="${PORT:-8286}"
export HOST="${HOST:-0.0.0.0}"
export NODE_ENV="${NODE_ENV:-production}"
export DB_PATH="${DB_PATH:-/app/data/database.db}"
export DOWNLOAD_FOLDER="${DOWNLOAD_FOLDER:-/app/downloads}"
export INGEST_FOLDER="${INGEST_FOLDER:-/app/ingest}"

# Generate ENCRYPTION_KEY if not provided
if [ -z "$ENCRYPTION_KEY" ]; then
  echo "ENCRYPTION_KEY not provided, generating new key..."
  ENCRYPTION_KEY=$(openssl rand -hex 32)
  export ENCRYPTION_KEY
  echo "ENCRYPTION_KEY generated successfully"
  echo "IMPORTANT: Save this key if you need to persist OAuth sessions:"
  echo "ENCRYPTION_KEY=$ENCRYPTION_KEY"
  echo ""
fi

# Create required directories
echo "Setting up directories..."
mkdir -p /app/data /app/downloads /app/ingest /app/.crawlee

# Note: We don't chown mounted volumes - they inherit permissions from the host
# The PUID/PGID should match your host user, so the nodejs user can already access them

# Run database migrations as nodejs user
echo "Running database migrations..."
cd /app/packages/api
su-exec nodejs node dist/db/migrate.js || echo "Warning: Migrations may have failed, continuing anyway..."

# Start the application
cd /app/packages/api
echo "Starting server on port $PORT..."
echo "Application will be available at http://localhost:$PORT"
echo "==================================="

# Run Node.js server as nodejs user
# The server handles graceful shutdown via SIGTERM/SIGINT handlers
exec su-exec nodejs node dist/index.js
