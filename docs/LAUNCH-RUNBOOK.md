# Launch Runbook — Tuesday canary → full power

The operator's script for launch week. Everything the agents could verify has been verified
(see the invariant sweep, PRs #39–#42); this is the short list only a human with real keys
can do, plus the canary plan and the kill switch.

## Pre-launch live checks (weekend — ~30 minutes total)

Each is a 2-minute check. Do them in order; 1 and 2 gate the rest.

1. **`{{personalization}}` blank-render test (CRITICAL).** Run "Add personalization + A/B"
   on a test campaign, then send a test email from Instantly for a lead with NO
   personalization value. The first line must render **blank** — if the literal
   `{{personalization}}` appears, do not launch (hub-loaded leads carry an empty default,
   but leads imported inside Instantly's own UI don't).
2. **Instantly step-analytics shape.** Confirms the subject tuner's data pipe:
   ```bash
   curl -s -H "Authorization: Bearer $INSTANTLY_API_KEY" \
     "https://api.instantly.ai/api/v2/campaigns/analytics/steps?campaign_id=<LIVE_CAMPAIGN_ID>" | head -c 2000
   ```
   Verify `step` is **1-based** and `variant` is **0-based or "A"-style**. If either is off,
   keep automation at **Approve-all** (tuner = recommend-only) and flag it — a high
   `unmatched` count in the daily cron's `variant_metrics` result means the same thing.
3. **Landing publish on a TEST domain.** Note the domain's existing DNS records first.
   Generate → Approve → Publish. Confirm: success toast with URL, the original MX/SPF/DKIM
   records all survive in Namecheap, only a `go` CNAME was added, page loads after DNS
   propagates (1–5 min). Re-publish → "record already present" (idempotent).
4. **STOP text.** From a phone with a recorded opt-in, text STOP to the Twilio number.
   The Channels consent ledger shows `opted_out` within seconds; Twilio's log shows 200.
5. **Apollo zero-credit check.** Note the personal key's credit balance, run "Auto-queue
   from engaged repliers" once, confirm the balance did not move.
6. **Full-flow smoke send** to a test inbox you control: source → load → launch checklist →
   launch (test campaign, your own address) → reply to it → watch it classify and appear in
   the queue → approve-and-send the answer → confirm receipt.

## Tuesday — canary

- Launch **ONE** campaign, **100–150 leads**, daily cap ≈ 10–15/inbox on a few inboxes.
- Let it run a full day. What "clean" looks like:
  - Telegram: no auto-pause alerts, no reconciler orphans.
  - Automation page: every job `ok`; `variant_metrics` shows counts with `unmatched: 0`.
  - Replies appear classified in the queue within ~10 min of arriving.
  - No bounce spike on Deliverability (auto-pause guards at the configured threshold).

## Wednesday/Thursday — ramp

- Clean canary → add campaigns and raise caps toward 30/inbox (~1,470/day ceiling across
  49 inboxes). Prefer 2 steps (≈50% Wed, 100% Thu) over one jump.
- Watch the same four dashboards each morning; the 13:00 UTC cron's Telegram brief is the
  daily heartbeat.

## Kill switch (decide now, not mid-incident)

1. **One campaign misbehaving** → Pause it (campaign page) — pauses in Instantly too.
2. **Replies misbehaving** → automation dial to **Approve-all** (Replies page) — every
   outbound reply then requires a human click.
3. **An inbox burning** → Pause it on Deliverability (the auto-pause usually beats you
   to it).
4. **Everything** → pause campaigns in Instantly directly; the hub mirrors on next sync.

## If something looks wrong

- Cron answered non-2xx / a job shows `error` → the daily result names the failing job and
  message verbatim (Automation page or the cron response).
- A reply claims "sent" but the prospect saw nothing → the reconciler returns it to the
  queue within 24h and pings Telegram; to force it, hit `/api/cron/daily` with the secret.
- Suppression doubts → Leads page universe counts; the DNC gate fails closed (a Supabase
  blip aborts the request rather than waving a load through).
