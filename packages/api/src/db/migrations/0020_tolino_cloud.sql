CREATE TABLE `tolino_settings` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text NOT NULL,
	`reseller_id` text NOT NULL,
	`email` text NOT NULL,
	`encrypted_password` text NOT NULL,
	`access_token` text,
	`refresh_token` text,
	`token_expires_at` integer,
	`hardware_id` text,
	`auto_upload` integer DEFAULT false NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tolino_settings_user_id_unique` ON `tolino_settings` (`user_id`);--> statement-breakpoint
ALTER TABLE `user_permissions` ADD `can_configure_tolino` integer DEFAULT true NOT NULL;