CREATE TABLE `email_recipients` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`email` text NOT NULL,
	`name` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `email_settings` (
	`id` integer PRIMARY KEY DEFAULT 1 NOT NULL,
	`enabled` integer DEFAULT false NOT NULL,
	`smtp_host` text,
	`smtp_port` integer DEFAULT 587 NOT NULL,
	`smtp_user` text,
	`smtp_password` text,
	`sender_email` text,
	`sender_name` text,
	`use_tls` integer DEFAULT true NOT NULL,
	`updated_at` integer NOT NULL
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
PRAGMA foreign_keys=ON;