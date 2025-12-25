PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_user_permissions` (
	`user_id` text PRIMARY KEY NOT NULL,
	`can_delete_downloads` integer DEFAULT false NOT NULL,
	`can_configure_notifications` integer DEFAULT false NOT NULL,
	`can_manage_requests` integer DEFAULT true NOT NULL,
	`can_configure_app` integer DEFAULT false NOT NULL,
	`can_configure_integrations` integer DEFAULT false NOT NULL,
	`can_configure_email` integer DEFAULT false NOT NULL,
	`can_see_download_owner` integer DEFAULT false NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_user_permissions`("user_id", "can_delete_downloads", "can_configure_notifications", "can_manage_requests", "can_configure_app", "can_configure_integrations", "can_configure_email", "can_see_download_owner") SELECT "user_id", "can_delete_downloads", "can_configure_notifications", "can_manage_requests", "can_configure_app", "can_configure_integrations", "can_configure_email", "can_see_download_owner" FROM `user_permissions`;--> statement-breakpoint
DROP TABLE `user_permissions`;--> statement-breakpoint
ALTER TABLE `__new_user_permissions` RENAME TO `user_permissions`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
ALTER TABLE `app_config` ADD `max_concurrent_downloads` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `email_recipients` ADD `user_id` text REFERENCES user(id);