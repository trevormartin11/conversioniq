-- ============================================================================
-- CIQ Hub — SMS + social DM channels (apply after 0003_ai_usage.sql)
-- The consent ledger (TCPA backbone for SMS), the non-email sending identities,
-- and the cross-channel outreach queue. Email stays on campaigns/sequence_variants;
-- this powers the /channels lane. The app degrades to empty if this isn't applied.
-- ============================================================================

-- Consent ledger — the global source of truth for who we may contact on which channel.
-- SMS sends are gated on an `opted_in` row here.
create table consent_records (
  id text primary key,
  lead_id text,
  channel text not null,                    -- sms | linkedin | instagram
  handle text not null,                     -- E.164 phone (sms) | @handle / slug (social)
  status text not null default 'pending',   -- opted_in | opted_out | pending
  source text not null default 'manual',    -- reply_keyword | web_optin | verbal | inbound_dm | import | manual
  proof text,                               -- evidence trail (e.g. "replied YES 6/3", form URL)
  captured_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  note text
);
create index idx_consent_channel_handle on consent_records (channel, handle);
create index idx_consent_status on consent_records (status);

-- Sending identities for the non-email channels (an SMS number, a social account).
create table channel_accounts (
  id text primary key,
  channel text not null,
  label text not null,
  identifier text not null,                 -- phone number or handle
  status text not null default 'pending',   -- active | warming | pending | error
  daily_cap integer not null default 25,    -- human-paced cap/day (the anti-ban chokepoint)
  sent_today integer not null default 0,
  ten_dlc text not null default 'n/a',      -- registered | pending | unregistered | n/a  (SMS only)
  provider text not null default 'manual',
  note text
);
create index idx_channel_accounts_channel on channel_accounts (channel);

-- The cross-channel outreach queue (SMS + social DMs).
create table outreach_messages (
  id text primary key,
  channel text not null,
  lead_id text,
  campaign_id text,
  account_id text,
  to_name text not null default '',
  to_handle text not null default '',
  body text not null default '',
  status text not null default 'draft',     -- needs_consent | draft | approved | sent | skipped | failed
  source text not null default 'manual',    -- ai | rules | manual
  consent_id text,                          -- the consent row that authorized an SMS send
  profile_url text,                         -- social profile the human opens to send
  rationale text,
  created_at timestamptz not null default now(),
  scheduled_at timestamptz,
  sent_at timestamptz,
  approved_by text,
  sent_by text,
  note text
);
create index idx_outreach_channel_status on outreach_messages (channel, status);
create index idx_outreach_created on outreach_messages (created_at desc);
