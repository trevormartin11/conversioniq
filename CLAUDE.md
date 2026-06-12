# CIQ Hub — agent notes

Cold-outreach operations hub (Next.js App Router + Supabase + Instantly/Zoho/Twilio/Anthropic).
Mock mode runs from the seed with zero keys; live mode hydrates from Supabase per request.

- `npm run typecheck && npm run lint && npm run test && npm run build` must all pass before any push.
- Tests run in mock mode by design (`vitest.setup.ts` strips integration env vars).
- DB migrations live in `db/migrations/` (0001–0007, run in order). Prod DDL goes through the
  operator (Supabase SQL editor) unless explicitly authorized in-session.

## Pre-launch verification checklist (REMIND THE OPERATOR — explicitly requested)

1. **`{{personalization}}` blank-render test (CRITICAL, requested by Trevor):** after running
   "Add personalization + A/B" on a campaign, send a test email to a lead that has NO
   personalization value loaded. Instantly must render the missing merge tag as an empty
   string. If the literal `{{personalization}}` text appears in the email, every
   non-personalized lead gets a broken first line — do NOT launch until this is confirmed.
2. One full-flow smoke send: source → load (suppression gate) → launch gate → reply →
   classification → approve-and-send, on a test inbox before Tuesday's real launch.
