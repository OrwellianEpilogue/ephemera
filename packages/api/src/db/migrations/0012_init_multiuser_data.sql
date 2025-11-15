-- This migration initializes the multi-user system with:
-- 1. Default app configuration from environment variables
-- 2. Assigns all existing downloads and download_requests to the admin user (created via setup wizard)
--
-- Note: The admin user is no longer created in this migration.
-- The first admin account is created through the setup wizard on first run.
-- For existing installations with orphaned data, the assignment logic below
-- will run after the admin is created via the wizard.

-- Update existing downloads to be owned by the first admin user
-- This will only apply if there are existing downloads when migration runs
-- For fresh installs, no admin exists yet, so this has no effect
-- For upgrades, existing data will be assigned to the admin created via wizard
UPDATE downloads
SET user_id = (SELECT id FROM user WHERE role = 'admin' LIMIT 1)
WHERE user_id IS NULL OR user_id = '';

-- Update existing download_requests to be owned by the first admin user
-- Same logic as above - only applies to existing data after admin is created
UPDATE download_requests
SET user_id = (SELECT id FROM user WHERE role = 'admin' LIMIT 1)
WHERE user_id IS NULL OR user_id = '';

-- Create default app configuration
-- This will be populated from environment variables at runtime
-- For now, we just create the record with defaults
INSERT INTO app_config (
  id,
  is_setup_complete,
  auth_method,
  download_folder,
  ingest_folder,
  retry_attempts,
  request_timeout,
  search_cache_ttl,
  created_at,
  updated_at
)
VALUES (
  1,
  0,  -- Setup is not complete yet, wizard must be run
  NULL,  -- Auth method will be set in wizard
  './downloads',  -- Default from schema
  '/path/to/final/books',  -- Default from schema
  3,  -- Default retry attempts
  30000,  -- Default request timeout (30 seconds)
  300,  -- Default search cache TTL (5 minutes)
  cast(unixepoch('subsecond') * 1000 as integer),
  cast(unixepoch('subsecond') * 1000 as integer)
);

-- Create default Calibre configuration (disabled by default)
INSERT INTO calibre_config (id, enabled)
VALUES (1, 0);
