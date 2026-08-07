-- Flag targeting: AND-combined property conditions that gate a flag before the % rollout.
-- Shape: [ { property, operator, value } ] where operator is one of
-- eq, ne, gt, gte, lt, lte. An empty array means "target everyone".
ALTER TABLE feature_flags ADD COLUMN IF NOT EXISTS targeting JSONB NOT NULL DEFAULT '[]'::jsonb;