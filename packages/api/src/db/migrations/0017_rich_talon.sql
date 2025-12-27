ALTER TABLE `apprise_settings` ADD `notify_on_request_pending_approval` integer DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE `apprise_settings` ADD `notify_on_request_approved` integer DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE `apprise_settings` ADD `notify_on_request_rejected` integer DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE `download_requests` ADD `approver_id` text REFERENCES user(id);--> statement-breakpoint
ALTER TABLE `download_requests` ADD `approved_at` integer;--> statement-breakpoint
ALTER TABLE `download_requests` ADD `rejected_at` integer;--> statement-breakpoint
ALTER TABLE `download_requests` ADD `rejection_reason` text;--> statement-breakpoint
ALTER TABLE `user_permissions` ADD `can_start_downloads` integer DEFAULT true NOT NULL;