-- Alerts can post to the Telegram chats and Slack channels a project has already connected
-- for its daily brief (brief_channels), in addition to email and a webhook URL.
ALTER TABLE alerts ADD COLUMN IF NOT EXISTS chat_channel_ids TEXT[] NOT NULL DEFAULT '{}';
