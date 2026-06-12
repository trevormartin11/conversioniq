/**
 * Pre-launch checklist — the FINAL gate before a campaign starts sending. Pure + testable;
 * the server action assembles the inputs. Two kinds of items:
 *   - automated checks (pass / warn / fail) — fails block launch (same rules the server
 *     re-enforces), warns inform but don't block;
 *   - manual sign-offs (`manual: true`) — things only a human can verify (the personalization
 *     blank-render test send, reading the live landing page). The UI requires every manual
 *     box ticked before Launch enables.
 */
import type { Campaign, Inbox, LandingPage, Lead, SequenceVariant } from "@/lib/data/types";
import { launchBlocker } from "./launch-gate";

export interface ChecklistItem {
  key: string;
  label: string;
  status: "pass" | "warn" | "fail";
  detail?: string;
  /** Requires an explicit operator tick in the UI. */
  manual?: boolean;
}

const PERSONALIZATION_TAG = "{{personalization}}";
const OPT_OUT_PATTERN = /unsubscribe|opt[ -]?out|reply stop|let me know if you'?d rather not/i;

export function buildLaunchChecklist(input: {
  campaign: Campaign;
  variants: SequenceVariant[];
  leads: Lead[];
  landing: LandingPage | null;
  inboxes: Inbox[];
  instantlyConnected: boolean;
  warmupGate: number;
}): ChecklistItem[] {
  const { campaign, variants, leads, landing, inboxes, instantlyConnected, warmupGate } = input;
  const items: ChecklistItem[] = [];
  const vars = variants.filter((v) => v.campaignId === campaign.id).sort((a, b) => a.step - b.step || a.variant.localeCompare(b.variant));
  const campaignLeads = leads.filter((l) => l.campaignId === campaign.id);

  // 1. Can it actually send? (Instantly link, inboxes, warmup — the hard server-side gate.)
  const block = launchBlocker(campaign, { instantlyConnected, warmupGate, inboxes });
  items.push({
    key: "sending",
    label: "Sending readiness — Instantly link, inboxes, warmup",
    status: block ? (block.reason === "warmup" ? "warn" : "fail") : "pass",
    detail: block?.message ?? `${campaign.inboxIds.length} inbox${campaign.inboxIds.length === 1 ? "" : "es"} assigned, all warmed past ${warmupGate}.`,
  });

  // 2. Sequence copy exists and every step is complete.
  if (!vars.length) {
    items.push({ key: "sequence", label: "Sequence copy", status: "fail", detail: "No sequence steps — add copy before launching." });
  } else {
    const empty = vars.filter((v) => !v.subject.trim() || !v.body.trim());
    items.push({
      key: "sequence",
      label: "Sequence copy complete",
      status: empty.length ? "fail" : "pass",
      detail: empty.length
        ? `${empty.length} variant${empty.length === 1 ? " has" : "s have"} an empty subject or body.`
        : `${new Set(vars.map((v) => v.step)).size} steps, ${vars.length} variants.`,
    });
  }

  // 3. Personalization — automated presence check + the manual blank-render test send.
  const step1 = vars.find((v) => v.step === Math.min(...vars.map((v) => v.step)));
  const personalized = !!step1?.body.includes(PERSONALIZATION_TAG);
  items.push({
    key: "personalization",
    label: "Personalization opener",
    status: personalized ? "pass" : "warn",
    detail: personalized
      ? "Step 1 carries the {{personalization}} opener — approved lines fill it; hub-loaded leads without one render blank."
      : "No {{personalization}} opener on step 1 — run “Add personalization + A/B” first if you want it.",
  });
  if (personalized) {
    items.push({
      key: "personalization_test",
      label: "Test email verified: a lead WITHOUT a personalization line renders a clean (blank) first line",
      status: "warn",
      manual: true,
      detail: "Send yourself a test from Instantly for a non-personalized lead. If the literal {{personalization}} text shows, do not launch.",
    });
  }

  // 4. Landing page — published and humanly reviewed.
  if (landing?.status === "published" && landing.publishedUrl) {
    items.push({ key: "landing", label: "Landing page published", status: "pass", detail: landing.publishedUrl });
    items.push({
      key: "landing_review",
      label: `Landing page read top-to-bottom at ${landing.publishedUrl.replace(/^https?:\/\//, "")} — copy, booking link, and video all good`,
      status: "warn",
      manual: true,
    });
  } else {
    items.push({
      key: "landing",
      label: "Landing page",
      status: "warn",
      detail: landing
        ? `Page is ${landing.status} — publish it from the campaign's Landing screen, or launch without one.`
        : "No landing page for this campaign — generate + publish one, or launch without it.",
    });
    items.push({
      key: "landing_skip",
      label: "Launching without a published landing page — intentional",
      status: "warn",
      manual: true,
    });
  }

  // 5. Leads loaded (suppression/dedupe already enforced at load time).
  items.push({
    key: "leads",
    label: "Leads loaded",
    status: campaignLeads.length > 0 ? "pass" : "warn",
    detail: campaignLeads.length > 0
      ? `${campaignLeads.length} lead${campaignLeads.length === 1 ? "" : "s"} on this campaign (suppression gate applied at load).`
      : "No leads tracked in the hub for this campaign — confirm Instantly has its list loaded.",
  });

  // 6. Compliance: the copy should give people a way out.
  const hasOptOut = vars.some((v) => OPT_OUT_PATTERN.test(v.body));
  items.push({
    key: "optout",
    label: "Opt-out line in the copy",
    status: hasOptOut ? "pass" : "warn",
    detail: hasOptOut ? undefined : "No unsubscribe/opt-out language found in any step — recommended for compliance and fewer spam flags.",
  });

  // 7. Caps sanity: the campaign cap should be coverable by its inboxes.
  const assigned = inboxes.filter((i) => campaign.inboxIds.includes(i.id));
  const inboxCapSum = assigned.reduce((s, i) => s + i.dailyCap, 0);
  if (assigned.length) {
    items.push({
      key: "caps",
      label: "Daily caps",
      status: campaign.dailyCap <= inboxCapSum ? "pass" : "warn",
      detail: `Campaign cap ${campaign.dailyCap}/day vs ${inboxCapSum}/day across ${assigned.length} inbox${assigned.length === 1 ? "" : "es"}.`,
    });
  }

  return items;
}

/** Launch may proceed only when nothing fails and every manual sign-off is ticked. */
export function checklistReady(items: ChecklistItem[], ticked: Set<string>): boolean {
  return items.every((i) => i.status !== "fail" && (!i.manual || ticked.has(i.key)));
}
