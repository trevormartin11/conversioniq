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

/** What makes a vertical a strong fit for ConversionIQ's omnichannel, anonymous-visitor-capturing sales agents. */
export const ICP_FIT =
  "ConversionIQ gives a business AI sales agents across every channel — social comments and DMs, website chat, SMS, WhatsApp — that answer instantly in the brand's voice, remember every conversation, identify otherwise-anonymous visitors without a form or login, recommend the offer that's right for the buyer AND profitable for the business, and book the sale with no human in the loop. Best-fit verticals share several of: meaningful inbound traffic and social engagement that today goes anonymous or unanswered; high value per customer or per order; an offer/catalog with enough margin variation to be worth steering; heavy after-hours or overflow demand; and a reachable owner/operator who feels the leak.";

const CURATED: Omit<VerticalIdea, "source">[] = [
  { vertical: "Med Spas", fit: 9, why: "High-ticket treatments, heavy after-hours DM/comment volume, owner-operated.", angle: "the 9pm 'how much is Botox?' DM that books with whoever answers first — plus the site visitors who never say who they are." },
  { vertical: "Dental & Ortho", fit: 9, why: "Implant/ortho cases worth thousands; new-patient inquiries leak after the front desk leaves.", angle: "new-patient questions that hit voicemail (or an unread DM) after hours." },
  { vertical: "Home Services (HVAC/Plumbing)", fit: 9, why: "Emergency-driven, first-to-answer wins, high job value.", angle: "the 'my AC just died' lead messaging three companies at once." },
  { vertical: "E-commerce / DTC", fit: 8, why: "High anonymous traffic, a catalog with real margin spread, conversations across chat/DM/SMS.", angle: "the ~98% who browse, leave, and never get steered to the right (and profitable) product." },
  { vertical: "Travel, Cruise & Hospitality", fit: 8, why: "High-consideration, multi-channel, package/upsell catalog with margin to optimize.", angle: "the ad-comment 'is this available in March?' that becomes a five-figure booking — or vanishes." },
  { vertical: "Cosmetic & Plastic Surgery", fit: 8, why: "Very high ticket, consult-driven, late-night research behavior.", angle: "consult requests that land after the office closes." },
  { vertical: "Auto Dealers & Repair", fit: 8, why: "High-value sales, internet leads decay within minutes.", angle: "web leads that ghost if you don't reply in five minutes." },
  { vertical: "Personal-Injury Law", fit: 8, why: "Each signed case is worth thousands; claimants sign with the first callback.", angle: "the injury lead that retains whoever responds first." },
  { vertical: "Multi-location Retail & Franchises", fit: 7, why: "Inbound scattered across locations and social with no single owner of the conversation.", angle: "DMs and comments across every location that no front desk actually owns." },
  { vertical: "Real Estate Brokerages", fit: 7, why: "High commission per deal; portal leads reward instant, always-on response.", angle: "portal leads that ghost the moment you're slow to respond." },
  { vertical: "Insurance Agencies", fit: 7, why: "Quote shoppers hit several agents; speed and follow-through win the bind.", angle: "quote requests shopping four agents at once." },
  { vertical: "Veterinary Clinics", fit: 7, why: "Appointment-driven with anxious, after-hours pet owners.", angle: "the worried pet owner messaging at midnight." },
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

/** Given a vertical, propose the specific problems CIQ solves for it — each a felt, cold-open-ready sentence. */
export async function suggestProblems(vertical: string): Promise<{ problems: string[]; source: "ai" | "rules" }> {
  const v = vertical.trim();
  const curated = () => {
    const hit = CURATED.find((c) => c.vertical.toLowerCase() === v.toLowerCase() || (v && c.vertical.toLowerCase().includes(v.toLowerCase().split(" ")[0])));
    return [
      ...(hit ? [hit.angle] : []),
      `After-hours DMs, comments and site chats for ${v || "them"} go unanswered, so booking-ready buyers leak to whoever replies first.`,
      `Most of ${v || "their"} site and ad traffic stays anonymous — people look, leave, and are never identified or followed up with.`,
    ].slice(0, 3);
  };
  if (!v || !aiAvailable()) return { problems: curated(), source: "rules" };
  try {
    const out = await complete({
      system: voiceSystemPrompt(),
      user: [
        ICP_FIT,
        `For the vertical "${v}", give the 3 most acute problems ConversionIQ solves — each one specific, felt sentence we could open a cold email with (the leak they actually feel). Concrete over generic; no preamble.`,
        `Return ONLY JSON: ["problem one","problem two","problem three"]`,
      ].join("\n\n"),
      maxTokens: 500,
    });
    const parsed = JSON.parse(out.match(/\[[\s\S]*\]/)?.[0] ?? out) as string[];
    const problems = parsed.filter((p) => typeof p === "string" && p.trim()).slice(0, 3);
    return problems.length ? { problems, source: "ai" } : { problems: curated(), source: "rules" };
  } catch {
    return { problems: curated(), source: "rules" };
  }
}

/** Given a problem statement, propose verticals that feel it most acutely (+ fit + angle). */
export async function suggestVerticalsForProblem(problem: string, exclude: string[] = []): Promise<VerticalIdea[]> {
  const ex = new Set(exclude.map((s) => s.toLowerCase().trim()));
  const curated = () => CURATED.filter((c) => !ex.has(c.vertical.toLowerCase())).slice(0, 5).map((c) => ({ ...c, source: "rules" as const }));
  if (!problem.trim() || !aiAvailable()) return curated();
  try {
    const out = await complete({
      system: voiceSystemPrompt(),
      user: [
        ICP_FIT,
        `We want to sell ConversionIQ by leading with this problem:\n"${problem.trim()}"`,
        `Propose 5 specific verticals that feel THIS problem most acutely and are a strong ICP fit${exclude.length ? ` (exclude: ${exclude.join(", ")})` : ""}.`,
        `For each: vertical, fit (1-10), why (one sentence), angle (one-line cold-open hook for that vertical, tied to the problem).`,
        `Return ONLY JSON: [{"vertical":"...","fit":8,"why":"...","angle":"..."}]`,
      ].join("\n\n"),
      maxTokens: 1100,
    });
    const parsed = JSON.parse(out.match(/\[[\s\S]*\]/)?.[0] ?? out) as Omit<VerticalIdea, "source">[];
    const ideas = parsed.filter((i) => i.vertical && !ex.has(i.vertical.toLowerCase())).map((i) => ({ ...i, fit: Number(i.fit) || 7, source: "ai" as const }));
    return ideas.length ? ideas : curated();
  } catch {
    return curated();
  }
}

/** Suggest the buyer titles/roles in a vertical that own the problem and can buy the fix. */
export async function suggestTitles(vertical: string, problem?: string): Promise<{ titles: string[]; source: "ai" | "rules" }> {
  const v = vertical.trim();
  const curated = () => ["Owner / Founder", "CEO", "Marketing Manager", "Director of Marketing", "Operations Manager", "General Manager"];
  if (!v || !aiAvailable()) return { titles: curated(), source: "rules" };
  try {
    const out = await complete({
      system: voiceSystemPrompt(),
      user: [
        `For a "${v}" business, list the 4-6 job titles most likely to OWN this problem and be able to buy a fix.`,
        problem?.trim() ? `Problem: "${problem.trim()}"` : "",
        `Favor the reachable decision-maker (often the owner/operator in SMB). Real titles only, no descriptions.`,
        `Return ONLY JSON: ["Title one","Title two"]`,
      ].filter(Boolean).join("\n\n"),
      maxTokens: 300,
    });
    const parsed = JSON.parse(out.match(/\[[\s\S]*\]/)?.[0] ?? out) as string[];
    const titles = parsed.filter((t) => typeof t === "string" && t.trim()).slice(0, 6);
    return titles.length ? { titles, source: "ai" } : { titles: curated(), source: "rules" };
  } catch {
    return { titles: curated(), source: "rules" };
  }
}
