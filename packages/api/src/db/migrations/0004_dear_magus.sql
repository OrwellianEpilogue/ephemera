CREATE TABLE `apprise_settings` (
	`id` integer PRIMARY KEY DEFAULT 1 NOT NULL,
	`enabled` integer DEFAULT false NOT NULL,
	`server_url` text,
	`custom_headers` text,
	`notify_on_new_request` integer DEFAULT true NOT NULL,
	`notify_on_download_error` integer DEFAULT true NOT NULL,
	`notify_on_available` integer DEFAULT true NOT NULL,
	`notify_on_delayed` integer DEFAULT true NOT NULL,
	`notify_on_update_available` integer DEFAULT true NOT NULL,
	`notify_on_request_fulfilled` integer DEFAULT true NOT NULL,
	`notify_on_book_queued` integer DEFAULT false NOT NULL,
	`updated_at` integer NOT NULL
);
