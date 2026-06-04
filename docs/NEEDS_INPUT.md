# Needs input / open items

Living list of what's decided, what I need from you, and what's parked. Updated as we go.

## ✅ Decided (from our kickoff Q&A)
- **First build:** metrics dashboard + reply approval, with copy approval and (later) AI A/B as data accrues.
- **Users:** 3 logins (Trevor + 2 partners), **equal powers**. Every CIQ credit spend still needs a confirmation.
- **CRM:** Zoho is canonical (leads + DNC).
- **Replies:** start approve-every → auto-send safe → maybe full auto (the automation dial).
- **Reply source:** Instantly unibox primary (it's connected to the Gmail inboxes), Gmail fallback.
- **Alerts:** Telegram. **Demos:** tracked in Zoho. **Commission:** 20% recurring ÷ 3 (~6.67% your share).
- **Hosting:** Vercel + dedicated Supabase. **AI:** Claude.

## 📥 What I need from you
1. **Three reference docs** so AI copy/replies match CIQ's real voice and the proven sequence:
   - `reference_ciq_product_playbook.md`
   - `medspa_v1_sequence.md` (the actual Med Spa copy)
   - `project_ciq_outbound.md` (context + prior-strategy post-mortem)
   Paste them in chat or drop them in `docs/reference/`. Until then, AI is grounded in the **conversioniq.ai** site copy (already encoded in `src/lib/ai/voice.ts`).
2. **A dedicated Supabase project** + the API keys in `docs/SETUP.md` (Instantly, Zoho, Apollo ×2, Gmail, Telegram, Anthropic).
3. **A Telegram bot** (3 steps in SETUP.md) so alerts reach your phone.

## ❓ Open questions (will ask when you're back — not blocking the build)
- Exact reply-handling tone per class — confirm once I have the playbook.
- Med Spa sequence: should the hub own the sequence copy, or mirror what's in Instantly?
- Any partner-specific limits later, or keep all three fully equal?
- Demo scheduling: book straight into CIQ's calendar, or hand the prospect a CIQ booking link?

## ⚠️ Pull request — needs a decision
The repo started **empty**, so the first push made `claude/inspiring-cori-f4yNR` the **default branch** with no separate base. Opening a normal draft PR is currently blocked by the environment's safety guards, which (correctly) prevented me from:
- pushing a `main` branch, **and**
- force-pushing / rewriting the feature branch.

The full build is safely pushed to `claude/inspiring-cori-f4yNR`. To get a clean reviewable PR, pick one when you're back:
1. **Authorize me** to push a `main` (or force-align the branch onto the empty `baseline` branch I created) — then I'll open the draft PR immediately. *(recommended)*
2. Set the repo's default branch to `baseline` yourself in GitHub settings, then I can open the PR.
3. Leave it — review the code directly on the `claude/inspiring-cori-f4yNR` branch.

## 🧠 Verified integration realities (baked into the code)
- Apollo: enrich **by id** returns email/domain/phone; search returns neither; CIQ credits are gated.
- Instantly v2: `Authorization: Bearer`; timezone must be a valid enum; prefer webhooks over polling.
- Zoho v6: hourly token mint from refresh token; `GET /Leads` needs a `fields` param.
