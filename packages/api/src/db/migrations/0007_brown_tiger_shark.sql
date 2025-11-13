CREATE TABLE `indexer_settings` (
	`id` integer PRIMARY KEY DEFAULT 1 NOT NULL,
	`newznab_enabled` integer DEFAULT false NOT NULL,
	`newznab_api_key` text,
	`sabnzbd_enabled` integer DEFAULT false NOT NULL,
	`sabnzbd_api_key` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
