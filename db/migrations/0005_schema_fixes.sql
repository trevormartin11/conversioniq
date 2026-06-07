-- ============================================================================
-- CIQ Hub — schema reconciliation (apply after 0004_channels.sql)
-- Fixes pre-existing drift between the code (store.ts writes / live.ts reads /
-- TS enums) and the 0001 schema. Without these, LIVE mode throws on the affected
-- writes. All statements are idempotent so this is safe to re-run.
-- ============================================================================

-- demos: the post-demo outcome + no-show-reminder fields exist in code
-- (store.recordDemoOutcome / addDemo / markDemoReminded) and are read back in
-- live.ts, but were never added to the schema — so booking a demo or recording
-- an outcome hard-fails in live mode. Add them (plain text/timestamptz, matching
-- how the loader reads them).
alter table demos add column if not exists outcome_reason text;
alter table demos add column if not exists outcome_note text;
alter table demos add column if not exists outcome_at timestamptz;
alter table demos add column if not exists civ_deal_id text;
alter table demos add column if not exists reminder_sent_at timestamptz;

-- suppression_reason enum is missing 'civ_customer' (present in the TS union and
-- used to permanently exclude existing ConversionIQ customers). Suppressing one
-- in live mode would throw without this value.
alter type suppression_reason add value if not exists 'civ_customer';

-- credit_provider enum only had the two Apollo providers; the TS union (and the
-- sourcing lanes) also use these. Add them so a meter/request for any provider
-- can persist in live mode.
alter type credit_provider add value if not exists 'lusha';
alter type credit_provider add value if not exists 'outscraper';
alter type credit_provider add value if not exists 'findymail';
alter type credit_provider add value if not exists 'millionverifier';
