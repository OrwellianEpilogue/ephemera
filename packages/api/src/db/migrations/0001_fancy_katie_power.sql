CREATE TABLE `download_requests` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`query_params` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` integer NOT NULL,
	`last_checked_at` integer,
	`fulfilled_at` integer,
	`fulfilled_book_md5` text
);
--> statement-breakpoint
ALTER TABLE `app_settings` ADD `request_check_interval` text DEFAULT '6h' NOT NULL;