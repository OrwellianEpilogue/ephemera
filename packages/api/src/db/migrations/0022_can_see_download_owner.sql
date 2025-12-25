-- Add permission for non-admins to see who added downloads
ALTER TABLE user_permissions ADD COLUMN can_see_download_owner integer NOT NULL DEFAULT 0;
