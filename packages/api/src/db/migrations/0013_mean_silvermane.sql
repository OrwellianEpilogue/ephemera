-- Add new column with default false
ALTER TABLE `app_settings` ADD `post_download_keep_in_downloads` integer DEFAULT false NOT NULL;
--> statement-breakpoint

-- Migrate data: keepInDownloads = NOT deleteTemp
-- If deleteTemp was true (default), keepInDownloads should be false
-- If deleteTemp was false (user wanted to keep files), keepInDownloads should be true
UPDATE `app_settings` SET `post_download_keep_in_downloads` = CASE
  WHEN `post_download_delete_temp` = 0 THEN 1
  ELSE 0
END;
--> statement-breakpoint

-- Drop the old column
ALTER TABLE `app_settings` DROP COLUMN `post_download_delete_temp`;
