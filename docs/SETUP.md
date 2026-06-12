# Go-live setup

The app runs in **preview mode** with no keys. Add the blocks below to `.env.local` (copy from `.env.example`) to switch each piece to live. You can do them in any order — each is independent.

> Your keys never live in the code. Locally they go in `.env.local` (git-ignored); in production they go in the Vercel project's Environment Variables.

---

## 1. Hub database (Supabase)

1. Create a **new, dedicated** Supabase project — **not** the Health OS project.
2. In the SQL editor, paste and run **every** migration in [`db/migrations/`](../db/migrations/) **in order** (`0001_init.sql` through `0007_integrity.sql`). Running only 0001 leaves core writes broken — booking a demo, costs, channels/consent, and landing pages all depend on 0002–0007.
3. Copy the project URL + anon key + service-role key into:
   ```
   NEXT_PUBLIC_SUPABASE_URL=...
   NEXT_PUBLIC_SUPABASE_ANON_KEY=...
   SUPABASE_SERVICE_ROLE_KEY=...
   ```
4. Enable Row Level Security before exposing the anon key publicly (the 3 partners share equal access).

When these are set, the app reads/writes Postgres instead of seed data.

## 2. AI (Anthropic Claude)

```
ANTHROPIC_API_KEY=sk-ant-...
ANTHROPIC_MODEL=claude-opus-4-8
```
Powers reply classification, drafts, and the copy coach. Without it the app uses a deterministic rules fallback.

## 3. Instantly.ai

```
INSTANTLY_API_KEY=...
INSTANTLY_WEBHOOK_SECRET=<any random string>
```
- The hub pulls replies from the unibox and reads inbox/warmup health.
- **Replies (preferred):** in Instantly, point a webhook at `https://<your-app>/api/webhooks/instantly?secret=<INSTANTLY_WEBHOOK_SECRET>`. On a reply event the webhook runs the full ingestion (classify → draft → persist → auto-handle → hot-ping); a fallback cron (`/api/cron/sync-replies`, every 10 min) catches anything missed.
- Note: when creating campaigns, `campaign_schedule.schedules[].timezone` must be a valid Instantly enum (`"America/New_York"` was rejected in testing — fetch the allowed list first).

## 4. Zoho CRM (canonical leads + Do-Not-Contact)

```
ZOHO_CLIENT_ID=...
ZOHO_CLIENT_SECRET=...
ZOHO_REFRESH_TOKEN=...
ZOHO_ACCOUNTS_URL=https://accounts.zoho.com
ZOHO_API_DOMAIN=https://www.zohoapis.com
```
OAuth refresh-token flow; the app mints hourly access tokens automatically. Reads require a `fields` param (handled in `lib/integrations/zoho.ts`).

## 5. Apollo — two keys, kept separate

```
APOLLO_PERSONAL_API_KEY=...   # search + enrich (free)
APOLLO_CIQ_API_KEY=...        # paid credits — the hub never spends these
```
- Discovery → enrich **by id** (search returns no email/domain).
- The CIQ key is never touched by the hub today — the meter on Leads is visibility only.

## 6. Gmail (reply fallback)

```
GMAIL_CLIENT_ID=...
GMAIL_CLIENT_SECRET=...
GMAIL_REFRESH_TOKEN=...
```
Only needed if you want to read a mailbox directly; the primary reply source is Instantly's unibox.

## 7. Telegram alerts — 3 steps

1. In Telegram, message **@BotFather** → `/newbot` → follow prompts → copy the **bot token**.
2. Send any message to your new bot, then open
   `https://api.telegram.org/bot<token>/getUpdates` and copy the `chat.id`.
3. Add:
   ```
   TELEGRAM_BOT_TOKEN=...
   TELEGRAM_CHAT_ID=...
   ```
Hot replies ping instantly; the daily digest posts here too.

## 8. ConversionIQ's Zoho org (partner — demo → outcome loop)

A **separate** Zoho org from your canonical CRM, with its own OAuth app, used **only** for the
outcome feedback loop: on a booked demo we create a Deal in CIQ's pipeline, and its won/lost
outcome flows back to train sourcing. Its historical data is never used for deal-size/economics.

```
ZOHO_CIQ_CLIENT_ID=...
ZOHO_CIQ_CLIENT_SECRET=...
ZOHO_CIQ_REFRESH_TOKEN=...
ZOHO_CIQ_ACCOUNTS_URL=https://accounts.zoho.com
ZOHO_CIQ_API_DOMAIN=https://www.zohoapis.com
ZOHO_CIQ_DEMO_STAGE=Demo Scheduled
ZOHO_CIQ_WON_STAGE=Closed Won
ZOHO_CIQ_LOST_STAGE=Closed Lost
CIQ_ZOHO_WEBHOOK_SECRET=<any random string>
```

- **Outcome webhook:** add a workflow in CIQ's Zoho that POSTs to `https://<your-app>/api/webhooks/civ-zoho?secret=<CIQ_ZOHO_WEBHOOK_SECRET>` when a Deal reaches a won/lost stage. Map the stage names via the `*_STAGE` vars above.
- **Reconcile cron (belt-and-suspenders):** `/api/cron/civ-outcomes` (every 6h) polls CIQ for any handed-off demo still awaiting an outcome, so a missed webhook still closes the loop.
- The CIQ pipeline stages (verified live) are: Discovery Call → Demo Scheduled → Demo Completed → Proposal Sent/Onboarding Scheduled → Onboarding Complete/Free Trial → **Closed Won** / **Closed Lost** → Paused Accounts — so the defaults above are correct.

## 9. Social signals (Proxycurl — optional)

```
PROXYCURL_API_KEY=...   # https://nubela.co/proxycurl → API key
```
Turns on the "Social" personalization signal: company LinkedIn presence (recent posts,
tagline) feeds the opener-line generator. Credit-metered per lookup; without the key the
other signals (website, hiring, reviews, news) carry personalization on their own. The
generic `SOCIAL_SIGNAL_API_URL/KEY` webhook adapter remains as an alternative.

> **Verify provider availability before subscribing**: Proxycurl announced a wind-down after
> LinkedIn's 2025 lawsuit — confirm the API answers (a 200 from
> `GET https://nubela.co/proxycurl/api/linkedin/company/resolve?company_domain=stripe.com`
> with your key) before counting on this signal. The adapter degrades silently to the other
> signals either way.

## 10. Landing-page publishing (Vercel + Namecheap)

```
VERCEL_TOKEN=...        # Vercel → Account Settings → Tokens
VERCEL_PROJECT_ID=...   # Project → Settings → General
VERCEL_TEAM_ID=...      # only if the project is in a team
LANDING_SUBDOMAIN=go    # optional; default "go"
```
With these set (plus Namecheap below), **Publish** on a campaign's landing page attaches
`go.<sending-domain>` to this Vercel project, creates the CNAME at Namecheap
(read-merge-write — other records untouched), and the page goes live at that URL.
`NEXT_PUBLIC_APP_URL` must be set so the public router can tell landing hosts from the app host.

## 11. Namecheap (DMARC / SPF auto-fix + landing CNAMEs)

```
NAMECHEAP_API_KEY=...
NAMECHEAP_USERNAME=...
NAMECHEAP_CLIENT_IP=<the calling server IP, whitelisted in Namecheap>
```
Enable API access in Namecheap and whitelist the calling IP. Powers safe read-merge-write DNS fixes for the sending domains.

---

## Operations & secrets

- **`SYNC_SECRET`** (or `CRON_SECRET`) gates the cron + ops endpoints. Set it in Vercel; Vercel Cron sends it automatically as a Bearer token. Manual calls pass `?secret=` or `Authorization: Bearer <secret>`.
- **Connection self-test:** Settings → **Test live connections** (or `GET /api/health/integrations?secret=<SYNC_SECRET>`) runs a read-only, zero-cost probe of every configured provider and reports which keys actually *work*, not just which are present. It never spends — Apollo uses only the free `auth/health` endpoint; Outscraper/Findymail/Lusha/Namecheap stay presence-only.
- **Crons** (in `vercel.json`): `sync-replies` (every 10 min), `daily` (13:00 UTC), `weekly-report` (Mon 14:00 UTC), `civ-outcomes` (every 6h).

---

## Deploy (Vercel)

1. Import the repo into Vercel.
2. Add all the env vars above to the project.
3. Deploy. The crons in `vercel.json` run automatically (see **Operations & secrets**); set `SYNC_SECRET` so they authenticate.
4. Set `NEXT_PUBLIC_APP_URL` to the deployed URL and register the Instantly webhook against it.
