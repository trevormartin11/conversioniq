-- ============================================================================
-- CIQ Hub — per-vertical landing pages (auto-generated microsites)
-- One page per campaign, published to that campaign's single sending domain.
-- Content is structured JSON (rendered by a fixed on-brand template, never raw HTML).
-- Apply after 0005. The app degrades to empty if this isn't applied.
-- ============================================================================
create table landing_pages (
  id text primary key,
  campaign_id text,
  vertical text not null default '',
  domain text,                              -- the campaign's domain this page lives on
  status text not null default 'draft',     -- draft | approved | published
  content jsonb not null default '{}'::jsonb,
  scheduler_url text,                        -- Cal.com booking link
  video_url text,                            -- YouTube features video
  published_url text,
  source text not null default 'rules',      -- ai | rules (of last generation)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  approved_by text,
  approved_at timestamptz,
  published_at timestamptz,
  note text
);
-- one landing page per campaign
create unique index idx_landing_campaign on landing_pages (campaign_id);
create index idx_landing_status on landing_pages (status);
