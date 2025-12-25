-- Migration: Add user ownership to email recipients
-- Email recipients are now per-user instead of global

-- Add userId column (nullable initially to allow existing rows)
ALTER TABLE `email_recipients` ADD `user_id` TEXT REFERENCES `user`(`id`) ON DELETE CASCADE;--> statement-breakpoint

-- Create index for efficient user lookups
CREATE INDEX `idx_email_recipients_user_id` ON `email_recipients`(`user_id`);
