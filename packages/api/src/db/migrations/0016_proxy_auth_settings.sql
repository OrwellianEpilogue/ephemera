CREATE TABLE `proxy_auth_settings` (
	`id` integer PRIMARY KEY DEFAULT 1 NOT NULL,
	`enabled` integer DEFAULT false NOT NULL,
	`header_name` text DEFAULT 'Remote-User' NOT NULL,
	`user_identifier` text DEFAULT 'email' NOT NULL,
	`trusted_proxies` text DEFAULT '' NOT NULL,
	`logout_redirect_url` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL
);
