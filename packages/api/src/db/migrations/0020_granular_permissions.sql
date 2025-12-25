-- Migration: Add granular permissions for settings tabs
-- Replace canAccessSettings with canConfigureApp, canConfigureIntegrations, canConfigureEmail

-- Add new permission columns
ALTER TABLE `user_permissions` ADD `can_configure_app` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `user_permissions` ADD `can_configure_integrations` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `user_permissions` ADD `can_configure_email` integer DEFAULT false NOT NULL;--> statement-breakpoint

-- Migrate existing canAccessSettings to new permissions
-- Users with canAccessSettings=true get all new permissions
UPDATE `user_permissions`
SET `can_configure_app` = `can_access_settings`,
    `can_configure_integrations` = `can_access_settings`,
    `can_configure_email` = `can_access_settings`,
    `can_configure_notifications` = CASE
      WHEN `can_access_settings` = 1 THEN 1
      ELSE `can_configure_notifications`
    END;
