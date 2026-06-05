-- ============================================================================
-- CIQ Hub — costs / P&L (apply after 0001_init.sql)
-- Tracks every operating cost: sending (Instantly), data (Apollo), email
-- (Workspace), domains, purchased leads, software, other.
-- ============================================================================

create type cost_category as enum ('sending','data','email','domains','leads','software','other');
create type cost_cadence as enum ('monthly','annual','one_time');

create table costs (
  id text primary key,
  category cost_category not null,
  vendor text not null,
  description text,
  amount numeric not null default 0,
  cadence cost_cadence not null default 'monthly',
  status text not null default 'active',
  started_at timestamptz not null default now(),
  next_charge_at timestamptz,
  source text not null default 'manual',  -- 'manual' | 'auto' (pulled from an integration)
  note text,
  created_by text
);
create index idx_costs_status on costs (status);
create index idx_costs_category on costs (category);
