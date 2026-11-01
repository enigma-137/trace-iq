-- Slack as a second daily-brief destination. A Slack channel is connected through
-- "Add to Slack" (incoming-webhook scope): Slack hands back a webhook URL tied to the
-- channel the person picked, so no bot token or channel list is needed.

ALTER TABLE brief_channels DROP CONSTRAINT IF EXISTS brief_channels_kind_check;
ALTER TABLE brief_channels ADD CONSTRAINT brief_channels_kind_check CHECK (kind IN ('telegram', 'slack'));

ALTER TABLE brief_link_codes DROP CONSTRAINT IF EXISTS brief_link_codes_kind_check;
ALTER TABLE brief_link_codes ADD CONSTRAINT brief_link_codes_kind_check CHECK (kind IN ('telegram', 'slack'));

-- The Slack incoming-webhook URL. A secret: anyone holding it can post to the channel,
-- so the API never returns it to the dashboard.
ALTER TABLE brief_channels ADD COLUMN IF NOT EXISTS webhook_url TEXT;
