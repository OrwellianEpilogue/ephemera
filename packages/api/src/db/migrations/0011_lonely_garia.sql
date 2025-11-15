CREATE TABLE `account` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`provider_id` text NOT NULL,
	`user_id` text NOT NULL,
	`access_token` text,
	`refresh_token` text,
	`id_token` text,
	`access_token_expires_at` integer,
	`refresh_token_expires_at` integer,
	`scope` text,
	`password` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `app_config` (
	`id` integer PRIMARY KEY DEFAULT 1 NOT NULL,
	`is_setup_complete` integer DEFAULT false NOT NULL,
	`auth_method` text,
	`searcher_base_url` text,
	`searcher_api_key` text,
	`quick_base_url` text,
	`download_folder` text DEFAULT './downloads' NOT NULL,
	`ingest_folder` text DEFAULT '/path/to/final/books' NOT NULL,
	`retry_attempts` integer DEFAULT 3 NOT NULL,
	`request_timeout` integer DEFAULT 30000 NOT NULL,
	`search_cache_ttl` integer DEFAULT 300 NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `calibre_config` (
	`id` integer PRIMARY KEY DEFAULT 1 NOT NULL,
	`enabled` integer DEFAULT false NOT NULL,
	`db_path` text,
	`base_url` text
);
--> statement-breakpoint
CREATE TABLE `session` (
	`id` text PRIMARY KEY NOT NULL,
	`expires_at` integer NOT NULL,
	`token` text NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer NOT NULL,
	`ip_address` text,
	`user_agent` text,
	`user_id` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `session_token_unique` ON `session` (`token`);--> statement-breakpoint
CREATE TABLE `user` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`email_verified` integer DEFAULT false NOT NULL,
	`image` text,
	`role` text DEFAULT 'user' NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `user_email_unique` ON `user` (`email`);--> statement-breakpoint
CREATE TABLE `user_permissions` (
	`user_id` text PRIMARY KEY NOT NULL,
	`can_delete_downloads` integer DEFAULT false NOT NULL,
	`can_configure_notifications` integer DEFAULT true NOT NULL,
	`can_manage_requests` integer DEFAULT true NOT NULL,
	`can_access_settings` integer DEFAULT false NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `verification` (
	`id` text PRIMARY KEY NOT NULL,
	`identifier` text NOT NULL,
	`value` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL
);
--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_indexer_settings` (
	`id` integer PRIMARY KEY DEFAULT 1 NOT NULL,
	`base_url` text DEFAULT 'http://localhost:8286' NOT NULL,
	`newznab_enabled` integer DEFAULT false NOT NULL,
	`newznab_api_key` text,
	`sabnzbd_enabled` integer DEFAULT false NOT NULL,
	`sabnzbd_api_key` text,
	`indexer_completed_dir` text DEFAULT '/downloads/complete' NOT NULL,
	`indexer_incomplete_dir` text DEFAULT '/downloads/incomplete' NOT NULL,
	`indexer_category_dir` integer DEFAULT false NOT NULL,
	`indexer_only_mode` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_indexer_settings`("id", "base_url", "newznab_enabled", "newznab_api_key", "sabnzbd_enabled", "sabnzbd_api_key", "indexer_completed_dir", "indexer_incomplete_dir", "indexer_category_dir", "indexer_only_mode", "created_at", "updated_at") SELECT "id", "base_url", "newznab_enabled", "newznab_api_key", "sabnzbd_enabled", "sabnzbd_api_key", "indexer_completed_dir", "indexer_incomplete_dir", "indexer_category_dir", "indexer_only_mode", "created_at", "updated_at" FROM `indexer_settings`;--> statement-breakpoint
DROP TABLE `indexer_settings`;--> statement-breakpoint
ALTER TABLE `__new_indexer_settings` RENAME TO `indexer_settings`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
-- First, add the columns as nullable so existing data can be migrated
ALTER TABLE `download_requests` ADD `user_id` text;--> statement-breakpoint
ALTER TABLE `downloads` ADD `user_id` text;