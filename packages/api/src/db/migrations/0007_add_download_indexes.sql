-- Create indexes for downloads table to improve queue status query performance
CREATE INDEX IF NOT EXISTS `idx_downloads_status` ON `downloads` (`status`);
CREATE INDEX IF NOT EXISTS `idx_downloads_queued_at` ON `downloads` (`queued_at`);
CREATE INDEX IF NOT EXISTS `idx_downloads_status_queued_at` ON `downloads` (`status`, `queued_at` DESC);
