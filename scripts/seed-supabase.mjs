// One-off: seed the hub DB with REAL structural config (no fake leads/replies —
// those arrive from Instantly/Zoho syncs). Idempotent (upsert). Run with:
//   NEXT_PUBLIC_SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/seed-supabase.mjs
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}
const db = createClient(url, key, { auth: { persistSession: false } });

const users = [
  { id: "u_trevor", name: "Trevor Martin", email: "trevor@conversioniq.ai", role: "owner", avatar_color: "#6366f1" },
  { id: "u_jon", name: "Jon Epstein", email: "jon@conversioniq.ai", role: "partner", avatar_color: "#10b981" },
  { id: "u_brian", name: "Brian Peters", email: "brian@conversioniq.ai", role: "partner", avatar_color: "#f59e0b" },
];
const personas = [
  { id: "pe_trevor", name: "Trevor Martin", from_name: "Trevor Martin", title: "Partnerships, ConversionIQ", signature: "Trevor" },
  { id: "pe_jon", name: "Jon Epstein", from_name: "Jon Epstein", title: "Growth, ConversionIQ", signature: "Jon" },
  { id: "pe_brian", name: "Brian Peters", from_name: "Brian Peters", title: "Partnerships, ConversionIQ", signature: "Brian" },
];
const domains = [
  { id: "d_joinconversioniq", domain: "joinconversioniq.com", persona_id: "pe_trevor", spf: true, dkim: true, dmarc: true, reputation: "green" },
  { id: "d_goconversioniq", domain: "goconversioniq.com", persona_id: "pe_trevor", spf: true, dkim: true, dmarc: true, reputation: "green" },
  { id: "d_getconversioniq", domain: "getconversioniq.com", persona_id: "pe_trevor", spf: true, dkim: true, dmarc: true, reputation: "green" },
];
const campaigns = [
  { id: "c_medspa", name: "Med Spa — Cold (v1)", vertical: "Med Spa", persona_id: "pe_trevor", status: "draft", instantly_campaign_id: null, list_version: "medspa_v1", inbox_ids: [], daily_cap: 120 },
];
const variants = [
  { id: "v_a", campaign_id: "c_medspa", step: 1, variant: "A", subject: "quick question", body: "{{firstName}},\n\nWhen someone messages {{companyName}} after you've closed — \"how much is X?\", \"any openings?\" — what happens to those right now?\n\nAsking because for most spas that's where bookings quietly leak: good inquiry, answered too late, books somewhere else.\n\nMind if I show you how a few spas are catching those automatically?\n\nTrevor", sent: 0, opens: 0, replies: 0, positives: 0, approved: true },
  { id: "v_b", campaign_id: "c_medspa", step: 1, variant: "B", subject: "the 9pm stuff", body: "{{firstName}},\n\nWhat happens to the late-night \"how much is Botox?\" DMs {{companyName}} gets after you've closed?\n\nFor most spas they go to whoever answers first. Curious if that's a non-issue for you, or a quiet annoyance.\n\nWorth a peek at how a few spas are catching them automatically?\n\nTrevor", sent: 0, opens: 0, replies: 0, positives: 0, approved: false },
];
const creditMeters = [
  { provider: "apollo_personal", label: "Apollo — Personal (search + enrich)", used: 0, total: 25000, gated: false },
  { provider: "apollo_ciq", label: "Apollo — CIQ (paid credits)", used: 0, total: 5000, gated: true },
];

async function up(table, rows, onConflict = "id") {
  const { error } = await db.from(table).upsert(rows, { onConflict });
  console.log(`${table.padEnd(18)} ${error ? "ERROR: " + error.message : rows.length + " row(s) upserted"}`);
  if (error) process.exitCode = 1;
}

await up("users", users);
await up("personas", personas);
await up("domains", domains);
await up("campaigns", campaigns);
await up("sequence_variants", variants);
await up("credit_meters", creditMeters, "provider");
console.log("seed complete");
