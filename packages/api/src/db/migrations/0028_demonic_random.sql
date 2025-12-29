CREATE TABLE `book_metadata` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`request_id` integer,
	`source` text NOT NULL,
	`source_book_id` text,
	`source_url` text,
	`title` text NOT NULL,
	`author` text NOT NULL,
	`description` text,
	`isbn` text,
	`series_name` text,
	`series_position` real,
	`published_year` integer,
	`pages` integer,
	`rating` real,
	`average_rating` real,
	`genres` text,
	`cover_url` text,
	`cover_path` text,
	`fetched_at` integer NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`request_id`) REFERENCES `download_requests`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `book_metadata_request_id_unique` ON `book_metadata` (`request_id`);--> statement-breakpoint
CREATE INDEX `bookMetadata_requestId_idx` ON `book_metadata` (`request_id`);--> statement-breakpoint
CREATE INDEX `bookMetadata_source_idx` ON `book_metadata` (`source`);