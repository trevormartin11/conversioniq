/**
 * Landing-page content generator. Produces STRUCTURED content (not raw HTML) for a vertical's
 * microsite, which a fixed, on-brand template renders — so every page stays consistent with
 * conversioniq.ai, is safe (no injected markup), and is field-editable before sign-off.
 *
 * Mirrors the conversioniq.ai section pattern: hero → problem → feature pillars → trust → book-a-demo.
 * AI when a Claude key is present; a vertical-aware template otherwise. The scheduler + video URLs
 * are config, not generated — see the page record.
 */
import { aiAvailable, complete } from "@/lib/integrations/anthropic";
import { voiceSystemPrompt } from "./voice";

export interface LandingFeature {
  title: string;
  body: string;
}
export interface LandingContent {
  vertical: string;
  seoTitle: string;
  seoDescription: string;
  hero: { eyebrow: string; headline: string; subhead: string; primaryCta: string; secondaryCta: string };
  problem: { heading: string; body: string; bullets: string[] };
  features: LandingFeature[];
  videoHeading: string;
  videoCaption: string;
  trust: { heading: string; points: string[] };
  cta: { heading: string; body: string; bookCta: string };
  formIntro: string;
  source: "ai" | "rules";
}

/** Deterministic, vertical-aware fallback — always returns a complete, on-pitch page. */
export function rulesLanding(vertical: string, problem?: string): LandingContent {
  const v = vertical.trim() || "local businesses";
  const lead = problem?.trim() || `When someone messages ${v} after hours — pricing, availability, "are you open?" — it sits unanswered until morning, and booking-ready buyers go to whoever replies first.`;
  return {
    vertical: v,
    seoTitle: `AI Sales Agent for ${v} | ConversionIQ`,
    seoDescription: `ConversionIQ answers every web, text, and social inquiry for ${v} in your brand's voice, 24/7 — qualifies the lead and books the appointment before a competitor replies.`,
    hero: {
      eyebrow: "Autonomous AI sales agents for web, SMS & social",
      headline: `Stop losing ${v} bookings to whoever replies first`,
      subhead: `ConversionIQ answers every web, text, and social message in your brand's voice — 24/7 — qualifies the inquiry, and books it straight to your calendar. Live in minutes, works with your CRM.`,
      primaryCta: "Book a demo",
      secondaryCta: "See it in action",
    },
    problem: {
      heading: "Your best leads come in after you've closed",
      body: lead,
      bullets: [
        "Evenings & weekends are when buyers browse — and when your team is gone.",
        "Speed-to-lead decides the sale: minutes win, mornings lose.",
        "Every missed after-hours inquiry is booked revenue handed to a faster competitor.",
      ],
    },
    features: [
      { title: "Answers in seconds, 24/7", body: `Every inquiry to ${v} gets an instant, on-brand reply — no after-hours gap, no missed message.` },
      { title: "Only says what you authorize", body: "You set the voice and the rules; it stays inside them and routes anything sensitive to your team. No rogue replies." },
      { title: "Books straight to your calendar", body: "It qualifies the lead and drops a booked appointment on your calendar — not just a captured email." },
      { title: "Syncs to your CRM, always current", body: "Every conversation and contact flows into the tools you already use. Live in minutes, no rip-and-replace." },
    ],
    videoHeading: "See ConversionIQ work",
    videoCaption: `A 2-minute look at how the AI agent handles a real ${v} inquiry end-to-end — from first message to booked appointment.`,
    trust: {
      heading: "Enterprise-grade, brand-safe",
      points: ["SOC 2 Type II certified", "Replies only within your authorized voice & rules", "Your data stays private", "Keeps your CRM up to date automatically"],
    },
    cta: {
      heading: `Ready to stop the after-hours leak at ${v}?`,
      body: "See exactly how it would answer and book your inquiries. Pick a time, or leave your number and we'll reach out.",
      bookCta: "Book my demo",
    },
    formIntro: "Prefer we reach out? Drop your details and we'll text or call to set it up.",
    source: "rules",
  };
}

/** Generate a vertical's landing-page content. AI when available; rules fallback otherwise. */
export async function generateLandingContent(input: { vertical: string; problem?: string; brief?: string }): Promise<LandingContent> {
  if (!aiAvailable()) return rulesLanding(input.vertical, input.problem);
  try {
    const out = await complete({
      system: voiceSystemPrompt(),
      user: [
        `Write the copy for a single landing page selling ConversionIQ — autonomous AI sales agents that answer a business's inbound web, SMS, and social messages 24/7, qualify the lead, and book the appointment — targeted at "${input.vertical}".`,
        input.problem ? `Lead with this specific pain: ${input.problem}` : "",
        input.brief ? `Context from the outreach campaign: ${input.brief}` : "",
        "Mirror conversioniq.ai: confident, concrete, benefit-led; speak to the vertical's real after-hours/ speed-to-lead pain; emphasize brand-safe, you-control-it, books-to-calendar, CRM-sync, live-in-minutes. Keep it tight — no fluff, no fake stats.",
        `Return ONLY compact JSON matching: {"seoTitle","seoDescription","hero":{"eyebrow","headline","subhead","primaryCta","secondaryCta"},"problem":{"heading","body","bullets":["",""]},"features":[{"title","body"}],"videoHeading","videoCaption","trust":{"heading","points":["",""]},"cta":{"heading","body","bookCta"},"formIntro"}. 3–4 features. No markdown.`,
      ].filter(Boolean).join("\n\n"),
      maxTokens: 1500,
      temperature: 0.6,
      purpose: "copy",
    });
    const parsed = JSON.parse(out.match(/\{[\s\S]*\}/)?.[0] ?? out) as Partial<LandingContent>;
    if (!parsed.hero?.headline || !parsed.features?.length) throw new Error("incomplete generation");
    const fallback = rulesLanding(input.vertical, input.problem);
    // Merge over the fallback so any missing field stays populated + on-brand.
    return {
      ...fallback,
      ...parsed,
      vertical: input.vertical.trim() || fallback.vertical,
      hero: { ...fallback.hero, ...parsed.hero },
      problem: { ...fallback.problem, ...parsed.problem },
      features: parsed.features?.length ? parsed.features : fallback.features,
      trust: { ...fallback.trust, ...parsed.trust },
      cta: { ...fallback.cta, ...parsed.cta },
      source: "ai",
    };
  } catch {
    return rulesLanding(input.vertical, input.problem);
  }
}
