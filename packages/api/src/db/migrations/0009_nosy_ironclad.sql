PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_app_settings` (
	`id` integer PRIMARY KEY DEFAULT 1 NOT NULL,
	`post_download_move_to_ingest` integer DEFAULT true NOT NULL,
	`post_download_upload_to_booklore` integer DEFAULT false NOT NULL,
	`post_download_move_to_indexer` integer DEFAULT false NOT NULL,
	`post_download_delete_temp` integer DEFAULT true NOT NULL,
	`post_download_action` text,
	`book_retention_days` integer DEFAULT 30 NOT NULL,
	`book_search_cache_days` integer DEFAULT 7 NOT NULL,
	`request_check_interval` text DEFAULT '6h' NOT NULL,
	`time_format` text DEFAULT '24h' NOT NULL,
	`date_format` text DEFAULT 'eur' NOT NULL,
	`library_url` text,
	`library_link_location` text DEFAULT 'sidebar' NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_app_settings`("id", "post_download_move_to_ingest", "post_download_upload_to_booklore", "post_download_move_to_indexer", "post_download_delete_temp", "post_download_action", "book_retention_days", "book_search_cache_days", "request_check_interval", "time_format", "date_format", "library_url", "library_link_location", "updated_at") SELECT
  "id",
  CASE WHEN "post_download_action" IN ('move_only', 'both') THEN 1 ELSE 0 END,
  CASE WHEN "post_download_action" IN ('upload_only', 'both') THEN 1 ELSE 0 END,
  0,
  1,
  "post_download_action",
  "book_retention_days",
  "book_search_cache_days",
  "request_check_interval",
  "time_format",
  "date_format",
  "library_url",
  "library_link_location",
  "updated_at"
FROM `app_settings`;--> statement-breakpoint
DROP TABLE `app_settings`;--> statement-breakpoint
ALTER TABLE `__new_app_settings` RENAME TO `app_settings`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
ALTER TABLE `downloads` ADD `download_source` text DEFAULT 'web' NOT NULL;--> statement-breakpoint
ALTER TABLE `indexer_settings` ADD `indexer_completed_dir` text DEFAULT '/downloads/complete' NOT NULL;--> statement-breakpoint
ALTER TABLE `indexer_settings` ADD `indexer_incomplete_dir` text DEFAULT '/downloads/incomplete' NOT NULL;--> statement-breakpoint
ALTER TABLE `indexer_settings` ADD `indexer_category_dir` integer DEFAULT true NOT NULL;