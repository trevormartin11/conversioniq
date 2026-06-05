/**
 * Strategy layer — propose which verticals to point the fleet at, and WHY.
 *
 * Today verticals are human-typed. This lets the AI suggest them, scored against
 * ConversionIQ's ICP fit, each with a rationale + the angle to lead copy with —
 * so the "why we chose it" travels into the copy and into the learning loop.
 */
import { aiAvailable, complete } from "@/lib/integrations/anthropic";
import { voiceSystemPrompt } from "./voice";
import type { Learning } from "./learnings";

export interface VerticalIdea {
  vertical: string;
  fit: number; // 1-10 against the ICP criteria
  why: string; // rationale, tied to fit criteria
  angle: string; // the pain/hook to open cold copy with
  source: "ai" | "rules";
}

/** What makes a vertical a strong fit for an instant-lead-response product. */
export const ICP_FIT =
  "ConversionIQ is an AI that instantly answers a business's inbound + after-hours leads (calls, forms, DMs) and books them into the calendar. Best-fit verticals share: high value per lead, high inbound/after-hours volume, speed-to-lead decides who wins the deal, a reachable owner/operator who feels the pain, and an appointment/consult-driven model.";

const CURATED: Omit<VerticalIdea, "source">[] = [
  { vertical: "Med Spas", fit: 9, why: "High-ticket treatments, heavy after-hours DM/form volume, owner-operated.", angle: "the booking-ready leads that message you at 9pm and book with whoever answers first." },
  { vertical: "Dental & Ortho", fit: 9, why: "Implant/ortho cases are worth thousands; missed new-patient calls are lost revenue.", angle: "new-patient calls that hit voicemail after the front desk goes home." },
  { vertical: "Home Services (HVAC/Plumbing)", fit: 9, why: "Emergency-driven, first-to-answer wins, high job value.", angle: "the 'my AC just died' lead that's calling three companies right now." },
  { vertical: "Roofing & Restoration", fit: 8, why: "Large project values, storm-driven inbound spikes, speed-to-lead decisive.", angle: "storm-damage leads that go cold before you call back." },
  { vertical: "Auto Dealers & Repair", fit: 8, why: "High-value sales, internet leads decay within minutes.", angle: "web leads that ghost if you don't reply in 5 minutes." },
  { vertical: "Personal-Injury Law", fit: 8, why: "Each signed case is worth thousands; claimants sign with the first callback.", angle: "the injury lead that retains whoever calls back first." },
  { vertical: "Cosmetic & Plastic Surgery", fit: 8, why: "Very high ticket, consult-driven, after-hours research behavior.", angle: "consult requests that land after the office closes." },
  { vertical: "Real Estate Brokerages", fit: 7, why: "High commission per deal, portal leads reward instant response.", angle: "Zillow leads that ghost when you're slow to respond." },
  { vertical: "Insurance Agencies", fit: 7, why: "Quote shoppers hit several agents; speed wins the bind.", angle: "quote requests that are shopping four agents at once." },
  { vertical: "Veterinary Clinics", fit: 7, why: "Appointment-driven with anxious, after-hours pet owners.", angle: "the worried pet owner messaging you at midnight." },
];

export async function proposeVerticals(
  exclude: string[],
  learnings: Pick<Learning, "theme" | "insight">[],
): Promise<VerticalIdea[]> {
  const ex = new Set(exclude.map((s) => s.toLowerCase().trim()));
  const fromCurated = () => CURATED.filter((c) => !ex.has(c.vertical.toLowerCase())).slice(0, 5).map((c) => ({ ...c, source: "rules" as const }));

  if (!aiAvailable()) return fromCurated();
  try {
    const out = await complete({
      system: voiceSystemPrompt(),
      user: [
        ICP_FIT,
        `Propose 5 target verticals we are NOT already running${exclude.length ? ` (exclude: ${exclude.join(", ")})` : ""}. Favor strong fit, but include one non-obvious wildcard with high upside.`,
        learnings.length ? `What we've learned so far:\n${learnings.map((l) => `- ${l.insight}`).join("\n")}` : "",
        `For each: vertical (specific, e.g. "Roofing contractors"), fit (1-10), why (one sentence tied to the fit criteria), angle (the one-line pain/hook to open the cold email with).`,
        `Return ONLY JSON: [{"vertical":"...","fit":8,"why":"...","angle":"..."}]`,
      ].filter(Boolean).join("\n\n"),
      maxTokens: 1100,
    });
    const parsed = JSON.parse(out.match(/\[[\s\S]*\]/)?.[0] ?? out) as Omit<VerticalIdea, "source">[];
    const ideas = parsed.filter((i) => i.vertical && !ex.has(i.vertical.toLowerCase())).map((i) => ({ ...i, fit: Number(i.fit) || 7, source: "ai" as const }));
    return ideas.length ? ideas : fromCurated();
  } catch {
    return fromCurated();
  }
}
