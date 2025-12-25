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
CREATE INDEX `account_userId_idx` ON `account` (`user_id`);--> statement-breakpoint
CREATE TABLE `apikey` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text,
	`start` text,
	`prefix` text,
	`key` text NOT NULL,
	`user_id` text NOT NULL,
	`refill_interval` integer,
	`refill_amount` integer,
	`last_refill_at` integer,
	`enabled` integer DEFAULT true,
	`rate_limit_enabled` integer DEFAULT true,
	`rate_limit_time_window` integer DEFAULT 86400000,
	`rate_limit_max` integer DEFAULT 10,
	`request_count` integer DEFAULT 0,
	`remaining` integer,
	`last_request` integer,
	`expires_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`permissions` text,
	`metadata` text,
	`deleted_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `apikey_key_idx` ON `apikey` (`key`);--> statement-breakpoint
CREATE INDEX `apikey_userId_idx` ON `apikey` (`user_id`);--> statement-breakpoint
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
	`max_concurrent_downloads` integer DEFAULT 1 NOT NULL,
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
CREATE TABLE `email_recipients` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`email` text NOT NULL,
	`name` text,
	`auto_send` integer DEFAULT false NOT NULL,
	`user_id` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
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
CREATE TABLE `session` (
	`id` text PRIMARY KEY NOT NULL,
	`expires_at` integer NOT NULL,
	`token` text NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer NOT NULL,
	`ip_address` text,
	`user_agent` text,
	`user_id` text NOT NULL,
	`impersonated_by` text,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `session_token_unique` ON `session` (`token`);--> statement-breakpoint
CREATE INDEX `session_userId_idx` ON `session` (`user_id`);--> statement-breakpoint
CREATE TABLE `sso_provider` (
	`id` text PRIMARY KEY NOT NULL,
	`issuer` text NOT NULL,
	`oidc_config` text,
	`saml_config` text,
	`user_id` text,
	`provider_id` text NOT NULL,
	`organization_id` text,
	`domain` text DEFAULT '' NOT NULL,
	`name` text,
	`allow_auto_provision` integer DEFAULT false NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sso_provider_provider_id_unique` ON `sso_provider` (`provider_id`);--> statement-breakpoint
CREATE TABLE `user` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`email_verified` integer DEFAULT false NOT NULL,
	`image` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`role` text,
	`banned` integer DEFAULT false,
	`ban_reason` text,
	`ban_expires` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `user_email_unique` ON `user` (`email`);--> statement-breakpoint
CREATE TABLE `user_permissions` (
	`user_id` text PRIMARY KEY NOT NULL,
	`can_delete_downloads` integer DEFAULT false NOT NULL,
	`can_configure_notifications` integer DEFAULT false NOT NULL,
	`can_manage_requests` integer DEFAULT true NOT NULL,
	`can_configure_app` integer DEFAULT false NOT NULL,
	`can_configure_integrations` integer DEFAULT false NOT NULL,
	`can_configure_email` integer DEFAULT false NOT NULL,
	`can_see_download_owner` integer DEFAULT false NOT NULL,
	`can_manage_api_keys` integer DEFAULT false NOT NULL,
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
CREATE INDEX `verification_identifier_idx` ON `verification` (`identifier`);--> statement-breakpoint
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
ALTER TABLE `download_requests` ADD `user_id` text NOT NULL REFERENCES user(id);--> statement-breakpoint
ALTER TABLE `downloads` ADD `user_id` text NOT NULL REFERENCES user(id);