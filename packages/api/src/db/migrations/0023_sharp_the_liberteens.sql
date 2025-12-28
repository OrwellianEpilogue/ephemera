CREATE TABLE `import_lists` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text NOT NULL,
	`source` text NOT NULL,
	`name` text NOT NULL,
	`source_config` text NOT NULL,
	`search_defaults` text,
	`import_mode` text DEFAULT 'future' NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`last_fetched_at` integer,
	`last_fetched_book_hashes` text,
	`fetch_error` text,
	`total_books_imported` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `importLists_userId_idx` ON `import_lists` (`user_id`);--> statement-breakpoint
CREATE INDEX `importLists_source_idx` ON `import_lists` (`source`);--> statement-breakpoint
CREATE TABLE `list_settings` (
	`id` integer PRIMARY KEY DEFAULT 1 NOT NULL,
	`list_fetch_interval` text DEFAULT '6h' NOT NULL,
	`hardcover_api_token` text,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL
);
--> statement-breakpoint
ALTER TABLE `user_permissions` ADD `can_manage_lists` integer DEFAULT true NOT NULL;