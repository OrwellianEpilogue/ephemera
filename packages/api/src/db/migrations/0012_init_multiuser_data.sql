-- Migration: Initialize multiuser data
-- This handles upgrades from pre-auth versions where downloads exist without user ownership

-- Create a migration user for orphaned downloads from pre-auth installs
INSERT INTO user (id, name, email, email_verified, created_at, updated_at, role)
SELECT
    'migration-user-00000000',
    'Migration User',
    'migration@localhost',
    1,
    (cast(unixepoch('subsecond') * 1000 as integer)),
    (cast(unixepoch('subsecond') * 1000 as integer)),
    'user'
WHERE NOT EXISTS (SELECT 1 FROM user WHERE id = 'migration-user-00000000');
--> statement-breakpoint

-- Update any orphaned downloads to belong to migration user
UPDATE downloads
SET user_id = 'migration-user-00000000'
WHERE user_id IS NULL OR user_id = '';
--> statement-breakpoint

-- Update any orphaned download requests to belong to migration user
UPDATE download_requests
SET user_id = 'migration-user-00000000'
WHERE user_id IS NULL OR user_id = '';
--> statement-breakpoint

-- Insert default app_config row if not exists
INSERT INTO app_config (id, is_setup_complete, download_folder, ingest_folder, retry_attempts, request_timeout, search_cache_ttl, max_concurrent_downloads, created_at, updated_at)
SELECT 1, 0, './downloads', '/path/to/final/books', 3, 30000, 300, 1,
    (cast(unixepoch('subsecond') * 1000 as integer)),
    (cast(unixepoch('subsecond') * 1000 as integer))
WHERE NOT EXISTS (SELECT 1 FROM app_config WHERE id = 1);
--> statement-breakpoint

-- Insert default calibre_config row if not exists
INSERT INTO calibre_config (id, enabled, db_path, base_url)
SELECT 1, 0, NULL, NULL
WHERE NOT EXISTS (SELECT 1 FROM calibre_config WHERE id = 1);
