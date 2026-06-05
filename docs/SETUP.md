# Go-live setup

The app runs in **preview mode** with no keys. Add the blocks below to `.env.local` (copy from `.env.example`) to switch each piece to live. You can do them in any order — each is independent.

> Your keys never live in the code. Locally they go in `.env.local` (git-ignored); in production they go in the Vercel project's Environment Variables.

---

## 1. Hub database (Supabase)

1. Create a **new, dedicated** Supabase project — **not** the Health OS project.
2. In the SQL editor, paste and run [`db/migrations/0001_init.sql`](../db/migrations/0001_init.sql).
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
- **Replies (preferred):** in Instantly, point a webhook at `https://<your-app>/api/webhooks/instantly?secret=<INSTANTLY_WEBHOOK_SECRET>`. A fallback cron (`/api/cron/sync-replies`, every 5 min) is configured in `vercel.json`.
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
APOLLO_CIQ_API_KEY=...        # paid credits — HARD-GATED, never auto-spent
```
- Discovery → enrich **by id** (search returns no email/domain).
- The CIQ key is only ever touched by an approved, audit-logged spend (see Credit Guard).

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

---

## Deploy (Vercel)

1. Import the repo into Vercel.
2. Add all the env vars above to the project.
3. Deploy. The cron in `vercel.json` runs `/api/cron/sync-replies` every 5 minutes.
4. Set `NEXT_PUBLIC_APP_URL` to the deployed URL and register the Instantly webhook against it.
