-- 0007: integrity fixes from the test sweep. Idempotent — safe to re-run.
--
-- (1) Personas the syncs hard-reference. syncInboxes/syncCampaigns write
--     persona_id = 'pe_trevor' / 'pe_jon' / 'pe_brian', which are FK-checked against
--     personas — a fresh deploy had no write path for that table, so the very first
--     sync failed wholesale on the FK.
insert into personas (id, name, from_name, title, signature) values
  ('pe_trevor', 'Trevor Martin', 'Trevor Martin', 'Partnerships, ConversionIQ', 'Trevor Martin' || chr(10) || 'ConversionIQ'),
  ('pe_jon',    'Jon Epstein',   'Jon Epstein',   'Partnerships, ConversionIQ', 'Jon Epstein'   || chr(10) || 'ConversionIQ'),
  ('pe_brian',  'Brian Peters',  'Brian Peters',  'Partnerships, ConversionIQ', 'Brian Peters'  || chr(10) || 'ConversionIQ')
on conflict (id) do nothing;

-- (2) Domain-level suppression uniqueness. Email rows are unique via lower(email), but
--     domain rows had no unique index — duplicates accumulated and drifted the universe
--     counts. Dedupe (keep the oldest row), then enforce.
delete from suppression a
  using suppression b
  where a.email is null and b.email is null
    and a.domain is not null and b.domain is not null
    and lower(a.domain) = lower(b.domain)
    and a.created_at > b.created_at;
create unique index if not exists idx_suppression_domain_unique
  on suppression (lower(domain))
  where domain is not null and email is null;
