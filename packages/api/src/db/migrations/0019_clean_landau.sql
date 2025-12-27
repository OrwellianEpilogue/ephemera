CREATE INDEX `requests_userId_idx` ON `download_requests` (`user_id`);--> statement-breakpoint
CREATE INDEX `requests_status_idx` ON `download_requests` (`status`);--> statement-breakpoint
CREATE INDEX `downloads_userId_idx` ON `downloads` (`user_id`);--> statement-breakpoint
CREATE INDEX `downloads_status_idx` ON `downloads` (`status`);