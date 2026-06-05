-- ============================================================================
-- CIQ Hub — initial schema (Supabase / Postgres)
-- Run in a DEDICATED Supabase project (NOT the Health OS project).
-- Mirrors src/lib/data/types.ts 1:1 so the data layer can swap from seed to live.
-- ============================================================================

-- --- enums ------------------------------------------------------------------
create type lead_status as enum ('new','contacted','opened','replied','positive','demo_booked','demo_showed','closed','lost');
create type reply_class as enum ('interested','question','objection','not_now','negative','unsubscribe','ooo','referral');
create type reply_status as enum ('pending','approved','sent','auto_sent','suppressed','snoozed','skipped');
create type automation_level as enum ('approve_all','auto_safe','auto_all');
create type suppression_reason as enum ('contacted','dnc','bounced','unsubscribed','complained','manual');
create type inbox_status as enum ('active','warming','paused','error');
create type campaign_status as enum ('active','paused','draft','completed');
create type demo_status as enum ('booked','showed','no_show','closed','lost');
create type credit_provider as enum ('apollo_personal','apollo_ciq');
create type health as enum ('green','yellow','red');
create type user_role as enum ('owner','partner');

-- --- core -------------------------------------------------------------------
create table users (
  id text primary key,
  name text not null,
  email text not null unique,
  role user_role not null default 'partner',
  avatar_color text not null default '#6366f1',
  created_at timestamptz not null default now()
);

create table personas (
  id text primary key,
  name text not null,
  from_name text not null,
  title text,
  signature text
);

create table domains (
  id text primary key,
  domain text not null unique,
  persona_id text references personas(id),
  spf boolean not null default false,
  dkim boolean not null default false,
  dmarc boolean not null default false,
  reputation health not null default 'green'
);

create table inboxes (
  id text primary key,
  email text not null unique,
  domain_id text references domains(id),
  persona_id text references personas(id),
  instantly_account_id text,
  warmup_score int not null default 0,
  status inbox_status not null default 'warming',
  daily_cap int not null default 20,
  sent_today int not null default 0,
  bounce_rate real not null default 0,
  spam_complaints int not null default 0,
  last_synced_at timestamptz
);

create table campaigns (
  id text primary key,
  name text not null,
  vertical text not null,
  persona_id text references personas(id),
  status campaign_status not null default 'draft',
  instantly_campaign_id text,
  list_version text,
  inbox_ids text[] not null default '{}',
  daily_cap int not null default 80,
  created_at timestamptz not null default now()
);

-- --- leads (attribution set at source — cannot retrofit) --------------------
create table leads (
  id text primary key,
  email text not null,
  domain text not null,
  first_name text,
  last_name text,
  company text,
  title text,
  phone text,
  campaign_id text references campaigns(id),
  vertical text,
  persona text,
  sending_domain text,
  list_version text,
  source text,
  attribution_owner text,
  status lead_status not null default 'new',
  zoho_lead_id text,
  apollo_id text,
  created_at timestamptz not null default now(),
  last_contacted_at timestamptz
);
create index idx_leads_email on leads (lower(email));
create index idx_leads_domain on leads (lower(domain));
create index idx_leads_campaign on leads (campaign_id);
create index idx_leads_status on leads (status);

create table replies (
  id text primary key,
  lead_id text references leads(id),
  campaign_id text references campaigns(id),
  inbox_id text references inboxes(id),
  instantly_email_id text,
  from_email text not null,
  from_name text,
  subject text,
  body text,
  received_at timestamptz not null default now(),
  classification reply_class not null,
  confidence real not null default 0,
  ai_draft text,
  draft_source text,
  status reply_status not null default 'pending',
  hot boolean not null default false,
  handled_by text,
  handled_at timestamptz
);
create index idx_replies_status on replies (status);
create index idx_replies_received on replies (received_at desc);

-- --- global suppression universe (enforced at LOAD time) --------------------
create table suppression (
  id text primary key,
  email text,
  domain text,
  reason suppression_reason not null,
  source text,
  lead_id text references leads(id),
  note text,
  created_at timestamptz not null default now()
);
create unique index idx_suppression_email on suppression (lower(email)) where email is not null;
create index idx_suppression_domain on suppression (lower(domain)) where domain is not null;

-- --- credit guard (CIQ spend gated) -----------------------------------------
create table credit_meters (
  provider credit_provider primary key,
  label text not null,
  used int not null default 0,
  total int not null default 0,
  resets_at timestamptz,
  gated boolean not null default false,
  last_synced_at timestamptz
);

create table credit_requests (
  id text primary key,
  provider credit_provider not null,
  amount int not null,
  reason text,
  requested_by text not null,
  status text not null default 'pending',
  decided_by text,
  created_at timestamptz not null default now(),
  decided_at timestamptz
);

-- --- audit, jobs, demos, variants, metrics, alerts --------------------------
create table audit_log (
  id text primary key,
  actor text not null,
  action text not null,
  entity text not null,
  entity_id text,
  meta jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index idx_audit_created on audit_log (created_at desc);

create table job_runs (
  id text primary key,
  job text not null,
  status text not null,
  last_run_at timestamptz,
  next_run_at timestamptz,
  duration_ms int,
  error text
);

create table demos (
  id text primary key,
  lead_id text references leads(id),
  scheduled_at timestamptz,
  status demo_status not null default 'booked',
  owner text,
  mrr numeric
);

create table sequence_variants (
  id text primary key,
  campaign_id text references campaigns(id),
  step int not null,
  variant text not null,
  subject text,
  body text,
  sent int not null default 0,
  opens int not null default 0,
  replies int not null default 0,
  positives int not null default 0,
  approved boolean not null default false
);

create table daily_metrics (
  date date not null,
  campaign_id text references campaigns(id),
  sends int not null default 0,
  opens int not null default 0,
  replies int not null default 0,
  positives int not null default 0,
  bounces int not null default 0,
  demos int not null default 0,
  primary key (date, campaign_id)
);

create table settings (
  key text primary key,
  value jsonb not null
);
insert into settings (key, value) values ('automation_level', '"approve_all"');

-- --- NOTE on RLS ------------------------------------------------------------
-- Enable Row Level Security before exposing the anon key to the browser. The
-- 3 partners share equal access today; scope policies to authenticated users.
