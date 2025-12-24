-- This migration initializes the multi-user system with:
-- 1. Creates a migration user to own orphaned downloads (for upgrades from pre-auth versions)
-- 2. Assigns all existing downloads and download_requests to this migration user
-- 3. Creates default app configuration
-- 4. Creates default calibre configuration
--
-- The migration user is a placeholder that ensures existing downloads aren't lost.
-- After setup, the admin can reassign these downloads or delete them.

-- Create a migration user to own orphaned downloads (only if there are orphaned downloads)
-- This user will be created with a deterministic ID so we can reference it
INSERT OR IGNORE INTO user (id, name, email, email_verified, role, banned, created_at, updated_at)
SELECT
  'migration-user-00000000-0000-0000-0000-000000000000',
  'Migration User',
  'migration@localhost',
  1,
  'user',
  0,
  cast(unixepoch('subsecond') * 1000 as integer),
  cast(unixepoch('subsecond') * 1000 as integer)
WHERE EXISTS (SELECT 1 FROM downloads WHERE user_id IS NULL OR user_id = '')
   OR EXISTS (SELECT 1 FROM download_requests WHERE user_id IS NULL OR user_id = '');
--> statement-breakpoint
-- Update existing downloads to be owned by the migration user
UPDATE downloads
SET user_id = 'migration-user-00000000-0000-0000-0000-000000000000'
WHERE user_id IS NULL OR user_id = '';
--> statement-breakpoint
-- Update existing download_requests to be owned by the migration user
UPDATE download_requests
SET user_id = 'migration-user-00000000-0000-0000-0000-000000000000'
WHERE user_id IS NULL OR user_id = '';
--> statement-breakpoint
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
--> statement-breakpoint
-- Create default Calibre configuration (disabled by default)
INSERT INTO calibre_config (id, enabled)
VALUES (1, 0);
