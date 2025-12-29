ALTER TABLE `apprise_settings` ADD `notify_on_list_created` integer DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE `apprise_settings` ADD `notify_on_tolino_configured` integer DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE `apprise_settings` ADD `notify_on_email_recipient_added` integer DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE `apprise_settings` ADD `notify_on_oidc_account_created` integer DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE `apprise_settings` ADD `notify_on_oidc_role_updated` integer DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE `apprise_settings` ADD `notify_on_service_unhealthy` integer DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE `apprise_settings` ADD `notify_on_service_recovered` integer DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE `apprise_settings` ADD `notify_on_email_sent` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `apprise_settings` ADD `notify_on_tolino_uploaded` integer DEFAULT false NOT NULL;