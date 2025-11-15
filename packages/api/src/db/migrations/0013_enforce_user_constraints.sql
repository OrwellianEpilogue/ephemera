-- This migration enforces NOT NULL and foreign key constraints on user_id columns
-- after the data has been migrated to the admin user in the previous migration

-- Enforce constraints on downloads table
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_downloads` (
	`md5` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`filename` text,
	`author` text,
	`publisher` text,
	`language` text,
	`format` text,
	`year` integer,
	`user_id` text NOT NULL,
	`download_source` text DEFAULT 'web' NOT NULL,
	`status` text NOT NULL,
	`size` integer,
	`downloaded_bytes` integer DEFAULT 0,
	`progress` real DEFAULT 0,
	`speed` text,
	`eta` integer,
	`countdown_seconds` integer,
	`countdown_started_at` integer,
	`temp_path` text,
	`final_path` text,
	`error` text,
	`retry_count` integer DEFAULT 0,
	`delayed_retry_count` integer DEFAULT 0,
	`next_retry_at` integer,
	`downloads_left` integer,
	`downloads_per_day` integer,
	`quota_checked_at` integer,
	`queued_at` integer NOT NULL,
	`started_at` integer,
	`completed_at` integer,
	`path_index` integer,
	`domain_index` integer,
	`upload_status` text,
	`uploaded_at` integer,
	`upload_error` text,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_downloads` SELECT * FROM `downloads`;--> statement-breakpoint
DROP TABLE `downloads`;--> statement-breakpoint
ALTER TABLE `__new_downloads` RENAME TO `downloads`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint

-- Enforce constraints on download_requests table
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_download_requests` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text NOT NULL,
	`query_params` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` integer NOT NULL,
	`last_checked_at` integer,
	`fulfilled_at` integer,
	`fulfilled_book_md5` text,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_download_requests` SELECT * FROM `download_requests`;--> statement-breakpoint
DROP TABLE `download_requests`;--> statement-breakpoint
ALTER TABLE `__new_download_requests` RENAME TO `download_requests`;--> statement-breakpoint
PRAGMA foreign_keys=ON;
