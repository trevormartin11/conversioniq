-- ============================================================================
-- CIQ Hub — Claude API usage metering (apply after 0002_costs.sql)
-- One row per Claude completion: token counts + estimated USD cost + what it was
-- for. Powers the live "Claude API spend" meter on the Costs page. Append-only.
-- ============================================================================

create table ai_usage (
  id text primary key,
  created_at timestamptz not null default now(),
  model text not null,
  purpose text not null default 'other',   -- classification | drafting | copy | sequence | strategy | personalization | next_moves | other
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  cache_read_tokens integer not null default 0,
  cache_creation_tokens integer not null default 0,
  cost_usd numeric not null default 0        -- estimated from token usage at list prices
);
create index idx_ai_usage_created on ai_usage (created_at desc);
create index idx_ai_usage_purpose on ai_usage (purpose);
