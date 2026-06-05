/**
 * Deterministic seed data — a realistic snapshot of the CIQ outbound operation.
 *
 * This powers MOCK mode (no external keys required) so the entire UI is
 * browsable and demoable. Numbers are generated from a fixed PRNG so they stay
 * stable across renders. Mirrors the real setup from the brief: 3 personas,
 * 15 domains, ~49 inboxes (only the original 3 Trevor inboxes fully warmed),
 * Med Spa as the first live vertical.
 */

import type {
  Alert,
  AuditEvent,
  Campaign,
  Cost,
  CreditMeter,
  CreditSpendRequest,
  Dataset,
  DailyMetric,
  Demo,
  Domain,
  Inbox,
  JobRun,
  Lead,
  LeadStatus,
  Persona,
  Reply,
  ReplyClass,
  SequenceVariant,
  SuppressionEntry,
  User,
} from "./types";

// --- deterministic PRNG (mulberry32) ---------------------------------------
function rng(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = rng(20260604);
const pick = <T>(arr: readonly T[]): T => arr[Math.floor(rand() * arr.length)];
const between = (lo: number, hi: number) => lo + rand() * (hi - lo);
const intBetween = (lo: number, hi: number) => Math.floor(between(lo, hi + 1));

const NOW = Date.now();
const iso = (ms: number) => new Date(ms).toISOString();
const minsAgo = (m: number) => iso(NOW - m * 60_000);
const hoursAgo = (h: number) => iso(NOW - h * 3_600_000);
const daysAgo = (d: number) => iso(NOW - d * 86_400_000);

// --- users (3 partners, equal powers) --------------------------------------
const users: User[] = [
  { id: "u_trevor", name: "Trevor Martin", email: "trevor@conversioniq.ai", role: "owner", avatarColor: "#6366f1" },
  { id: "u_jon", name: "Jon Epstein", email: "jon@conversioniq.ai", role: "partner", avatarColor: "#10b981" },
  { id: "u_brian", name: "Brian Peters", email: "brian@conversioniq.ai", role: "partner", avatarColor: "#f59e0b" },
  { id: "u_jacob", name: "Jacob", email: "jacob@conversioniq.ai", role: "partner", avatarColor: "#ec4899" },
  { id: "u_travis", name: "Travis", email: "travis@conversioniq.ai", role: "partner", avatarColor: "#06b6d4" },
  { id: "u_jason", name: "Jason", email: "jason@conversioniq.ai", role: "partner", avatarColor: "#a855f7" },
];

// --- personas (sending identities) -----------------------------------------
const personas: Persona[] = [
  { id: "pe_trevor", name: "Trevor Martin", fromName: "Trevor Martin", title: "Partnerships, ConversionIQ", signature: "Trevor Martin\nConversionIQ\nAI Sales Agents — live in minutes" },
  { id: "pe_jon", name: "Jon Epstein", fromName: "Jon Epstein", title: "Growth, ConversionIQ", signature: "Jon Epstein\nConversionIQ" },
  { id: "pe_brian", name: "Brian Peters", fromName: "Brian Peters", title: "Partnerships, ConversionIQ", signature: "Brian Peters\nConversionIQ" },
];

// --- domains (15) -----------------------------------------------------------
const domainNames: Record<string, string[]> = {
  pe_trevor: ["joinconversioniq.com", "goconversioniq.com", "getconversioniq.com", "tryconversioniq.com", "useconversioniq.com"],
  pe_jon: ["conversioniqhq.com", "conversioniqlabs.com", "conversioniqapp.com", "withconversioniq.com", "conversioniqai.com"],
  pe_brian: ["conversioniqgo.com", "conversioniqnow.com", "conversioniqpro.com", "conversioniqteam.com", "heyconversioniq.com"],
};
const WARMED_DOMAINS = new Set(["joinconversioniq.com", "goconversioniq.com", "getconversioniq.com"]);

const domains: Domain[] = [];
for (const [personaId, names] of Object.entries(domainNames)) {
  for (const domain of names) {
    domains.push({
      id: `d_${domain.split(".")[0]}`,
      domain,
      personaId,
      spf: true,
      dkim: true,
      dmarc: rand() > 0.2,
      reputation: WARMED_DOMAINS.has(domain) ? "green" : rand() > 0.3 ? "yellow" : "green",
    });
  }
}

// --- inboxes (~49, 3-4 per domain; only original Trevor 3 fully warmed) -----
const localParts: Record<string, string[]> = {
  pe_trevor: ["trevor", "trevor.martin", "t.martin", "hello"],
  pe_jon: ["jon", "jon.epstein", "j.epstein"],
  pe_brian: ["brian", "brian.peters", "b.peters"],
};
const inboxes: Inbox[] = [];
for (const d of domains) {
  const parts = localParts[d.personaId];
  const count = d.personaId === "pe_trevor" ? 4 : 3;
  for (let i = 0; i < count; i++) {
    const email = `${parts[i % parts.length]}@${d.domain}`;
    const isOriginal = WARMED_DOMAINS.has(d.domain) && parts[i % parts.length] === "trevor";
    const warmupScore = isOriginal ? intBetween(90, 98) : intBetween(28, 79);
    const status = isOriginal ? "active" : warmupScore >= 80 ? "active" : "warming";
    inboxes.push({
      id: `ib_${d.domain.split(".")[0]}_${i}`,
      email,
      domainId: d.id,
      personaId: d.personaId,
      instantlyAccountId: `acct_${Math.random().toString(36).slice(2, 8)}`,
      warmupScore,
      status: status as Inbox["status"],
      dailyCap: isOriginal ? 40 : 20,
      sentToday: status === "active" ? intBetween(8, 38) : 0,
      bounceRate: between(0.005, isOriginal ? 0.02 : 0.06),
      spamComplaints: rand() > 0.85 ? intBetween(1, 4) : 0,
      lastSyncedAt: minsAgo(intBetween(2, 40)),
    });
  }
}
// One inbox tripped a threshold -> paused, to exercise the auto-pause UI.
const tripped = inboxes.find((ib) => ib.status === "warming");
if (tripped) {
  tripped.status = "paused";
  tripped.bounceRate = 0.071;
}

const warmedTrevorInboxes = inboxes.filter((ib) => ib.warmupScore >= 80 && ib.personaId === "pe_trevor").map((ib) => ib.id);

// --- campaigns --------------------------------------------------------------
const campaigns: Campaign[] = [
  { id: "c_medspa", name: "Med Spa — Cold (v2)", vertical: "Med Spa", personaId: "pe_trevor", status: "active", instantlyCampaignId: "ic_medspa", listVersion: "medspa_v2", inboxIds: warmedTrevorInboxes, dailyCap: 120, createdAt: daysAgo(18) },
  { id: "c_home", name: "Home Services — Cold", vertical: "Home Services", personaId: "pe_jon", status: "draft", instantlyCampaignId: null, listVersion: "home_v1", inboxIds: [], dailyCap: 80, createdAt: daysAgo(6) },
  { id: "c_dental", name: "Dental — Pilot", vertical: "Dental", personaId: "pe_brian", status: "draft", instantlyCampaignId: null, listVersion: "dental_v1", inboxIds: [], dailyCap: 60, createdAt: daysAgo(3) },
];

// --- leads (generated, attributed at source) --------------------------------
const firstNames = ["Sarah", "Mike", "Jessica", "David", "Amanda", "Chris", "Lauren", "Brian", "Nicole", "Kevin", "Megan", "Ryan", "Ashley", "Jason", "Brittany", "Eric", "Stephanie", "Daniel", "Rachel", "Matt"];
const lastNames = ["Johnson", "Williams", "Brown", "Garcia", "Miller", "Davis", "Rodriguez", "Martinez", "Lopez", "Gonzalez", "Wilson", "Anderson", "Thomas", "Taylor", "Moore", "Jackson", "Lee", "Perez", "White", "Harris"];
const medspaCompanies = ["Radiance Med Spa", "Glow Aesthetics", "Renew Skin & Laser", "Lux Med Spa", "Pure Aesthetics", "Bella Vita Med Spa", "Elite Skin Studio", "Serenity Med Spa", "Allure Aesthetics", "Revive Wellness & Spa"];
const titles = ["Owner", "Practice Manager", "Medical Director", "Marketing Director", "Front Office Lead"];
const statusWeights: [LeadStatus, number][] = [
  ["contacted", 50], ["opened", 22], ["replied", 9], ["positive", 5],
  ["demo_booked", 3], ["demo_showed", 2], ["closed", 1], ["lost", 4], ["new", 4],
];
function weightedStatus(): LeadStatus {
  const total = statusWeights.reduce((s, [, w]) => s + w, 0);
  let r = rand() * total;
  for (const [st, w] of statusWeights) {
    if ((r -= w) <= 0) return st;
  }
  return "contacted";
}

const leads: Lead[] = [];
for (let i = 0; i < 140; i++) {
  const fn = pick(firstNames);
  const ln = pick(lastNames);
  const company = pick(medspaCompanies);
  const slug = company.toLowerCase().replace(/[^a-z]+/g, "");
  const domain = `${slug}.com`;
  const status = weightedStatus();
  const createdMs = NOW - intBetween(1, 20) * 86_400_000;
  leads.push({
    id: `l_${i}`,
    email: `${fn.toLowerCase()}@${domain}`,
    domain,
    firstName: fn,
    lastName: ln,
    company,
    title: pick(titles),
    phone: rand() > 0.4 ? `+1${intBetween(200, 989)}${intBetween(200, 989)}${intBetween(1000, 9999)}` : null,
    campaignId: "c_medspa",
    vertical: "Med Spa",
    persona: "Trevor Martin",
    sendingDomain: pick([...WARMED_DOMAINS]),
    listVersion: "medspa_v2",
    source: "apollo",
    attributionOwner: "Trevor Martin",
    status,
    zohoLeadId: `zcrm_${4000000 + i}`,
    apolloId: `apl_${Math.random().toString(36).slice(2, 10)}`,
    createdAt: iso(createdMs),
    lastContactedAt: status === "new" ? null : iso(createdMs + 3_600_000),
  });
}

// --- replies (hand-crafted, realistic across every class) -------------------
type ReplySeed = {
  lead: number;
  cls: ReplyClass;
  subject: string;
  body: string;
  draft: string | null;
  status?: Reply["status"];
  hot?: boolean;
  conf?: number;
};
const replySeeds: ReplySeed[] = [
  {
    lead: 3, cls: "interested", hot: true, conf: 0.96,
    subject: "Re: cutting front-desk follow-up at Radiance",
    body: "This is interesting timing — we lose a ton of leads after hours and on weekends. How does the demo work and how long does setup actually take?",
    draft: "Glad it landed — that after-hours leak is exactly the thing. The demo's quick: 15 minutes where the team shows it answering real med-spa DMs and booking the consult. Setup's fast too — quick to turn on, no developers. Want me to grab you a slot Thursday, 11a or 2p ET?\n\nTrevor",
  },
  {
    lead: 11, cls: "question", hot: true, conf: 0.9,
    subject: "Re: AI booking for Glow Aesthetics",
    body: "Does this just replace our scheduler, or does it work with what we already use? We're on a GoHighLevel setup.",
    draft: "Good question — it doesn't replace it. It works alongside GoHighLevel, so nothing you've built goes away; it just answers the DMs, comments and site chat and books into what you already use. Easiest to see it live — worth a quick 15 minutes this week?\n\nTrevor",
  },
  {
    lead: 21, cls: "objection", conf: 0.84,
    subject: "Re: quick question",
    body: "We tried a chatbot before and it was robotic and off-brand. Not interested in another one.",
    draft: "Totally fair — that's the first thing owners worry about. The difference: you set the voice and the rules, it stays inside them, and anything sensitive routes to your team. No rogue, off-brand replies. Rather than take my word, I can send a 30-second clip of it handling real med-spa questions. Worth a look?\n\nTrevor",
  },
  {
    lead: 34, cls: "not_now", conf: 0.88,
    subject: "Re: follow-up",
    body: "Slammed through end of quarter. Maybe circle back in July?",
    draft: "Completely understand — end of quarter is brutal. I'll follow up in early July. In the meantime I'll hold a demo slot so you can see it the moment things calm down. Have a good close to the quarter, Sarah.",
  },
  {
    lead: 47, cls: "referral", conf: 0.8,
    subject: "Re: ConversionIQ",
    body: "Not me, but our marketing lead Jamie handles this. jamie@radiancemedspa.com",
    draft: "Thanks for pointing me to Jamie — I appreciate it. I'll reach out to them directly and keep you off the thread. Have a great week!",
  },
  {
    lead: 52, cls: "ooo", status: "snoozed", conf: 0.99,
    subject: "Automatic reply: Out of office",
    body: "I'm out of the office until June 12 with limited email access. For urgent matters contact the front desk.",
    draft: null,
  },
  {
    lead: 63, cls: "negative", status: "suppressed", conf: 0.95,
    subject: "Re: quick question",
    body: "No thanks, we're not interested. Please stop emailing.",
    draft: null,
  },
  {
    lead: 70, cls: "unsubscribe", status: "suppressed", conf: 0.99,
    subject: "Re: AI agents",
    body: "Unsubscribe.",
    draft: null,
  },
  {
    lead: 8, cls: "interested", hot: true, conf: 0.93,
    subject: "Re: never miss a lead at Lux Med Spa",
    body: "We definitely miss inquiries on Instagram DMs. What does pricing look like?",
    draft: "Yep — the IG DMs are the classic leak. It answers those, plus comments and site chat, in your voice and books the consult. On pricing, the team tailors it on the demo since it depends on your volume and channels, and there's a free trial to start. Want a quick 15-minute walkthrough this week?\n\nTrevor",
  },
  {
    lead: 19, cls: "question", conf: 0.78,
    subject: "Re: quick idea for Renew",
    body: "Is our patient data safe with this? We're careful about HIPAA-adjacent stuff.",
    draft: "Smart to ask. Your data is segregated and private — it's never shared with public LLMs, and the platform is built to enterprise security standards (SOC 2 / ISO 42001). The demo team can speak to your specific compliance needs directly. Could I grab you 15 minutes this week to go through it?",
  },
];

const replies: Reply[] = replySeeds.map((rs, i) => {
  const lead = leads[rs.lead];
  lead.status = rs.cls === "interested" ? "positive" : "replied";
  return {
    id: `r_${i}`,
    leadId: lead.id,
    campaignId: lead.campaignId,
    inboxId: warmedTrevorInboxes[i % warmedTrevorInboxes.length] ?? inboxes[0].id,
    instantlyEmailId: `iem_${Math.random().toString(36).slice(2, 10)}`,
    fromEmail: lead.email,
    fromName: `${lead.firstName} ${lead.lastName}`,
    subject: rs.subject,
    body: rs.body,
    receivedAt: minsAgo(intBetween(4, 600)),
    classification: rs.cls,
    confidence: rs.conf ?? 0.85,
    aiDraft: rs.draft,
    draftSource: rs.draft ? "ai" : null,
    status: rs.status ?? "pending",
    hot: rs.hot ?? false,
    handledBy: rs.status === "suppressed" || rs.status === "snoozed" ? "system" : null,
    handledAt: rs.status === "suppressed" || rs.status === "snoozed" ? minsAgo(intBetween(4, 600)) : null,
  };
});

// --- suppression (global universe enforced at LOAD time) --------------------
const suppression: SuppressionEntry[] = [];
for (const lead of leads) {
  if (lead.status !== "new") {
    suppression.push({ id: `sup_${lead.id}`, email: lead.email, domain: null, reason: "contacted", source: "campaign:c_medspa", leadId: lead.id, createdAt: lead.lastContactedAt ?? lead.createdAt, note: null });
  }
}
suppression.push(
  { id: "sup_dnc1", email: "owner@elitelaserspa.com", domain: null, reason: "dnc", source: "zoho", leadId: null, createdAt: daysAgo(40), note: "Asked to never contact — Zoho DNC" },
  { id: "sup_unsub1", email: leads[70].email, domain: null, reason: "unsubscribed", source: "reply:r_7", leadId: leads[70].id, createdAt: minsAgo(120), note: "One-click unsubscribe" },
  { id: "sup_dom1", email: null, domain: "competitorspa.com", reason: "manual", source: "manual", leadId: null, createdAt: daysAgo(12), note: "Competitor domain — never contact" },
  { id: "sup_bounce1", email: "info@closedmedspa.com", domain: null, reason: "bounced", source: "instantly", leadId: null, createdAt: daysAgo(2), note: "Hard bounce" },
);

// --- credit meters (Apollo personal + CIQ gated) ----------------------------
const creditMeters: CreditMeter[] = [
  { provider: "apollo_personal", label: "Apollo — Personal (search + enrich)", used: 12480, total: 25000, resetsAt: daysAgo(-12), gated: false, lastSyncedAt: minsAgo(15) },
  { provider: "apollo_ciq", label: "Apollo — CIQ (paid credits)", used: 820, total: 5000, resetsAt: daysAgo(-20), gated: true, lastSyncedAt: minsAgo(15) },
];
const creditRequests: CreditSpendRequest[] = [
  { id: "cr_1", provider: "apollo_ciq", amount: 500, reason: "Enrich 500 net-new Home Services leads (Jon) for c_home launch", requestedBy: "Jon Epstein", status: "pending", decidedBy: null, createdAt: hoursAgo(3), decidedAt: null },
];

// --- audit log --------------------------------------------------------------
const audit: AuditEvent[] = [
  { id: "a_1", actor: "Trevor Martin", action: "reply.approved", entity: "reply", entityId: "r_0", meta: { lead: "Sarah Johnson" }, createdAt: hoursAgo(2) },
  { id: "a_2", actor: "system", action: "lead.suppressed", entity: "lead", entityId: leads[63].id, meta: { reason: "negative" }, createdAt: hoursAgo(4) },
  { id: "a_3", actor: "system", action: "inbox.auto_paused", entity: "inbox", entityId: tripped?.id ?? "", meta: { bounceRate: 0.071 }, createdAt: hoursAgo(6) },
  { id: "a_4", actor: "Jon Epstein", action: "credit.spend_requested", entity: "apollo_ciq", entityId: "cr_1", meta: { amount: 500 }, createdAt: hoursAgo(3) },
];

// --- jobs -------------------------------------------------------------------
const jobs: JobRun[] = [
  { id: "j_sync", job: "sync_replies", status: "ok", lastRunAt: minsAgo(4), nextRunAt: minsAgo(-6), durationMs: 2400, error: null },
  { id: "j_refill", job: "list_refill", status: "ok", lastRunAt: hoursAgo(6), nextRunAt: hoursAgo(-18), durationMs: 8800, error: null },
  { id: "j_brief", job: "daily_brief", status: "ok", lastRunAt: hoursAgo(9), nextRunAt: hoursAgo(-15), durationMs: 1200, error: null },
  { id: "j_weekly", job: "weekly_report", status: "ok", lastRunAt: daysAgo(2), nextRunAt: daysAgo(-5), durationMs: 5300, error: null },
];

// --- demos ------------------------------------------------------------------
const demoBase = { outcomeReason: null, outcomeNote: null, outcomeAt: null, civDealId: null, reminderSentAt: null };
const demos: Demo[] = [
  { id: "dm_1", leadId: leads[3].id, scheduledAt: daysAgo(-2), status: "booked", owner: "Jon Epstein", mrr: null, ...demoBase, civDealId: "civseed_1" },
  { id: "dm_2", leadId: leads[8].id, scheduledAt: daysAgo(1), status: "showed", owner: "Jon Epstein", mrr: null, ...demoBase, civDealId: "civseed_2" },
  { id: "dm_3", leadId: leads[12].id, scheduledAt: daysAgo(4), status: "no_show", owner: "Jon Epstein", mrr: null, ...demoBase, civDealId: "civseed_3", reminderSentAt: daysAgo(5) },
  { id: "dm_4", leadId: leads[15].id, scheduledAt: daysAgo(9), status: "closed", owner: "Jon Epstein", mrr: 1200, ...demoBase, civDealId: "civseed_4", outcomeAt: daysAgo(7) },
  { id: "dm_5", leadId: leads[22].id, scheduledAt: daysAgo(14), status: "closed", owner: "Jon Epstein", mrr: 900, ...demoBase, civDealId: "civseed_5", outcomeAt: daysAgo(12) },
  { id: "dm_6", leadId: leads[18].id, scheduledAt: daysAgo(6), status: "lost", owner: "Jon Epstein", mrr: null, ...demoBase, civDealId: "civseed_6", outcomeReason: "no_budget", outcomeAt: daysAgo(5), outcomeNote: "Liked it, revisiting next quarter." },
];

// --- sequence variants (Med Spa step 1 A/B) ---------------------------------
const variants: SequenceVariant[] = [
  { id: "v_a", campaignId: "c_medspa", step: 1, variant: "A", subject: "quick question", body: "{{firstName}},\n\nWhen someone messages {{companyName}} after you've closed — \"how much is X?\", \"any openings?\" — what happens to those right now?\n\nAsking because for most spas that's where bookings quietly leak: good inquiry, answered too late, books somewhere else.\n\nMind if I show you how a few spas are catching those automatically?\n\nTrevor", sent: 642, opens: 402, replies: 41, positives: 14, approved: true },
  { id: "v_b", campaignId: "c_medspa", step: 1, variant: "B", subject: "the 9pm stuff", body: "{{firstName}},\n\nWhat happens to the late-night \"how much is Botox?\" DMs {{companyName}} gets after you've closed?\n\nFor most spas they go to whoever answers first. Curious if that's a non-issue for you, or a quiet annoyance.\n\nWorth a peek at how a few spas are catching them automatically?\n\nTrevor", sent: 638, opens: 358, replies: 33, positives: 9, approved: true },
];

// --- daily metrics (last 14 days, global + medspa) --------------------------
const metrics: DailyMetric[] = [];
for (let d = 13; d >= 0; d--) {
  const date = new Date(NOW - d * 86_400_000).toISOString().slice(0, 10);
  const sends = intBetween(60, 130);
  const opens = Math.round(sends * between(0.45, 0.68));
  const reps = Math.round(sends * between(0.04, 0.09));
  const pos = Math.round(reps * between(0.25, 0.45));
  metrics.push({ date, campaignId: "c_medspa", sends, opens, replies: reps, positives: pos, bounces: Math.round(sends * between(0.005, 0.03)), demos: rand() > 0.6 ? intBetween(0, 2) : 0 });
}

// --- alerts -----------------------------------------------------------------
const alerts: Alert[] = [
  { id: "al_1", level: "red", title: "Inbox auto-paused", detail: `${tripped?.email ?? "an inbox"} crossed 7% bounce rate and was paused to protect domain reputation.`, createdAt: hoursAgo(6), source: "deliverability" },
  { id: "al_2", level: "yellow", title: "CIQ credit spend awaiting approval", detail: "Jon requested 500 CIQ credits for the Home Services launch.", createdAt: hoursAgo(3), source: "credits" },
  { id: "al_3", level: "green", title: "3 hot replies waiting", detail: "Interested/question replies in the approval queue need a look.", createdAt: minsAgo(18), source: "replies" },
];

// --- costs (the operation's P&L inputs) -------------------------------------
// Amounts marked "est." are my best estimates from the known stack — edit on the
// Costs page to match your actual invoices.
const costs: Cost[] = [
  // Sending stack
  { id: "co_instantly", category: "sending", vendor: "Instantly", description: "Sending + warmup (~49 inboxes)", amount: 97, cadence: "monthly", status: "active", startedAt: daysAgo(60), nextChargeAt: daysAgo(-12), source: "manual", note: "est. — confirm plan tier; extra sending slots cost more", createdBy: "Trevor Martin" },
  { id: "co_workspace", category: "email", vendor: "Google Workspace", description: "~49 sending inboxes (Business Starter seats)", amount: 294, cadence: "monthly", status: "active", startedAt: daysAgo(58), nextChargeAt: daysAgo(-6), source: "manual", note: "est. 49 × ~$6/seat — adjust to your paid-seat count (aliases are free)", createdBy: "Trevor Martin" },
  { id: "co_domains", category: "domains", vendor: "Namecheap", description: "Sending domains — annual registration", amount: 180, cadence: "annual", status: "active", startedAt: daysAgo(58), nextChargeAt: daysAgo(-300), source: "manual", note: "est. ~15 × ~$12/yr; year-2 renewals usually run higher than intro", createdBy: "Trevor Martin" },
  // Infrastructure
  { id: "co_supabase", category: "software", vendor: "Supabase", description: "Database + auth (Pro)", amount: 25, cadence: "monthly", status: "active", startedAt: daysAgo(25), nextChargeAt: daysAgo(-5), source: "manual", note: "est. Pro tier; Free tier is $0 until you outgrow it", createdBy: "Trevor Martin" },
  { id: "co_vercel", category: "software", vendor: "Vercel", description: "Hosting + cron jobs (Pro)", amount: 20, cadence: "monthly", status: "active", startedAt: daysAgo(25), nextChargeAt: daysAgo(-5), source: "manual", note: "est. Pro enables crons/usage; Hobby is $0 if it fits", createdBy: "Trevor Martin" },
  // Data / AI (usage-based estimates)
  { id: "co_apollo", category: "data", vendor: "Apollo", description: "Search + enrich subscription", amount: 99, cadence: "monthly", status: "active", startedAt: daysAgo(60), nextChargeAt: daysAgo(-9), source: "manual", note: "est. — confirm your Apollo plan", createdBy: "Trevor Martin" },
  { id: "co_anthropic", category: "software", vendor: "Anthropic (Claude)", description: "AI drafts, reply classification, copy coach", amount: 15, cadence: "monthly", status: "active", startedAt: daysAgo(20), nextChargeAt: daysAgo(-10), source: "manual", note: "est. usage-based; only while the Claude key is active", createdBy: "Trevor Martin" },
  { id: "co_apicredit", category: "data", vendor: "MillionVerifier / Outscraper", description: "API credit top-up (verification/sourcing)", amount: 10, cadence: "one_time", status: "active", startedAt: daysAgo(1), nextChargeAt: null, source: "manual", note: "the $10 you loaded yesterday — tell me which service and I'll relabel + set cadence", createdBy: "Trevor Martin" },
];

export function buildSeed(): Dataset {
  return {
    users, personas, domains, inboxes, campaigns, leads, replies,
    suppression, creditMeters, creditRequests, audit, jobs, demos,
    variants, metrics, alerts, costs,
  };
}
