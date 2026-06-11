# CIQ Hub — Central Control Hub

One place to track, manage, and control the parallel cold-email operation reselling **ConversionIQ** — many inboxes, many campaigns/verticals, multiple personas. Maximum automation, minimal operator input: approve warm replies, watch health, and let the system do the rest.

It is an **orchestration + unification layer**, not a rebuild. Instantly keeps doing sending/warmup/rotation; Zoho stays the CRM; Apollo is the data. The hub adds the glue none of them has alone: a single overview, a unified reply-approval queue, global suppression, attribution, deliverability guardrails, and unified analytics.

> **Runs with zero keys.** With no credentials configured the app serves rich, deterministic **seed data** ("preview mode") so the whole UI is browsable and demoable. Each integration lights up independently as its keys are added.

---

## Quick start

```bash
npm install
npm run dev      # http://localhost:3000
```

No environment variables are required for the preview. To go live, copy `.env.example` → `.env.local` and follow **[docs/SETUP.md](docs/SETUP.md)**.

```bash
npm run build      # production build
npm run typecheck  # tsc --noEmit
npm run lint       # next lint
```

---

## What's in Phase 1 (the daily driver)

| Screen | What it does |
| --- | --- |
| **Command Center** (`/`) | Today's sends/replies/positives/demos, replies-by-type, 14-day trend, per-campaign health cards (🟢🟡🔴), deliverability glance, alerts. Built for a 10-second phone read. |
| **Reply Approval** (`/replies`) | Every reply in one place, AI-classified, AI/rules-drafted response, one-tap approve / edit / send. The **automation dial** (approve-all → auto-safe → mostly-auto). Auto-suppress on negative/unsubscribe; snooze on OOO. |
| **Leads & Suppression** (`/leads`) | Master lead table, the global suppression universe, **load-time dedupe** of a new list, and a **"have we touched this person/domain?"** checker. |
| **Credits & budget** (on `/leads`) | Live provider credit meters next to where you spend them. CIQ credits are never spent by the hub — sourcing runs on your own keys. |

## Scaffolded for Phase 2 / 3

Deliverability & inbox health, Campaigns, Copy Coach (live AI suggestions on A/B results), Pipeline & Residual (20% ÷ 3), Automation/jobs, and Settings (integration status + go-live checklist). These read live models today; full controls land in later phases.

---

## Tech

- **Next.js 15** (App Router) · **TypeScript** · **Tailwind** · mobile-first.
- **Supabase / Postgres** for the hub DB (schema in [`db/migrations/0001_init.sql`](db/migrations/0001_init.sql)).
- **Claude** for reply classification, drafting, and copy suggestions (deterministic rules fallback when no key).
- Integrations: **Instantly** (sending + replies + health), **Zoho CRM** (canonical leads + DNC), **Apollo** (data), **Gmail** (reply fallback), **Telegram** (alerts).

## Project structure

```
src/
  app/(dashboard)/        # the screens (command, replies, leads, credits, …)
  app/api/                # health, Instantly webhook, sync cron
  components/             # app shell + UI primitives + feature components
  lib/
    config.ts             # integration detection + business rules
    data/                 # types, seed, store (swap to Supabase here), queries
    integrations/         # Instantly, Zoho, Apollo, Gmail, Telegram, Anthropic
    ai/                   # voice guide, classify, draft, copy coach
db/migrations/            # Postgres schema
docs/                     # SETUP, ARCHITECTURE, NEEDS_INPUT
```

See **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)** for the principles (one source of truth per data type, attribution-at-source, mock↔live seam) and **[docs/NEEDS_INPUT.md](docs/NEEDS_INPUT.md)** for open questions.
