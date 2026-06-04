# Architecture

## The one principle
**Orchestration + unification, not a rebuild.** Instantly already does sending/warmup/rotation/basic stats; Zoho is the CRM; Apollo is data. The hub pulls from all three and adds the glue none has alone. We never reimplement what a tool already does well.

## System of record (decided once — avoids sync hell)
| Data | Canonical home |
| --- | --- |
| Leads / contacts / Do-Not-Contact | **Zoho CRM** |
| Sending + replies + inbox/warmup health | **Instantly** |
| Orchestration + analytics + the cross-tool JOIN + attribution | **Hub DB (Supabase)** |

The Hub DB is a **dedicated** Supabase project, separate from the (off-limits) Health OS Supabase.

## Attribution at source (cannot retrofit)
Every lead is tagged at creation and carries those tags end-to-end: `campaign_id`, `vertical`, `persona`, `sending_domain`, `list_version`, `source`, `attribution_owner`, plus the lifecycle `status` (`new → contacted → opened → replied → positive → demo_booked → demo_showed → closed → lost`). These power every view and the residual tracking, and can't be reconstructed later — so they live on the record from birth.

## The mock ↔ live seam
The entire app reads/writes through `src/lib/data/store.ts` and `queries.ts`. Today those operate on an in-memory dataset built from `seed.ts`. To go live, swap the function bodies in `store.ts` for Supabase queries — **no page or component changes**. `src/lib/config.ts` detects which integrations are configured (`DATA_MODE = live | mock`) so the UI shows honest status.

```
pages / components
        │  (only ever call these)
        ▼
  data/store.ts  ──►  in-memory seed   (mock)
  data/queries.ts ─►  Supabase         (live)  ← swap here
```

## Integrations
`src/lib/integrations/*` wrap each external API with a tiny typed client. Every client checks `config.ts` first and throws a clear `NotConfiguredError` (or soft-fails for non-critical paths like Telegram) when keys are missing — so nothing crashes in preview.

- **Instantly** — accounts (warmup), campaigns, emails (unibox), blocklist, pause.
- **Zoho** — OAuth token mint + leads + DNC writes.
- **Apollo** — search (no email) + enrich-by-id; CIQ spend isolated behind an approval gate.
- **Telegram / Gmail / Anthropic** — alerts / reply fallback / AI.

## Replies pipeline
```
Instantly webhook  ─┐
                    ├─►  classify (Claude|rules)  ─►  draft (Claude|rules)  ─►  queue
cron sync (5 min)  ─┘                                                            │
                                          hot? ─► Telegram ping        approve / edit / send
                          negative/unsub ─► suppress + Zoho DNC        OOO ─► snooze/reschedule
```
The **automation dial** governs how much sends without a human: `approve_all` (default) → `auto_safe` (OOO/referral auto) → `auto_all`.

## Safety (non-negotiable)
- **Global suppression at LOAD time.** New lists are deduped against the entire contacted + DNC + bounced + unsubscribed universe *before* anyone enters a campaign (`dedupeAgainstUniverse`).
- **Deliverability guardrails.** Warmup gate (block sends < 80), auto-pause on bounce/spam thresholds, caps + send windows + domain stagger. Reputation is existential across shared domains.
- **CIQ credit hard-gate.** The CIQ Apollo key is touched only by `enrichWithCiqCredits`, which refuses to run without an approved, audit-logged request.
- **Audit log** for every sensitive action (approvals, suppressions, pauses, credit spend).
- **RLS** on Supabase before the anon key is exposed; secrets only in env, never in code.

## Build phases
1. **Daily driver** — Command Center, Reply Approval, suppression, credit guard. *(this PR)*
2. **Improve & control** — full campaign control, AI copy coach + A/B, deliverability auto-pause.
3. **Measure & scale** — pipeline, demo tracker, residual, win-cell analysis, weekly report.
