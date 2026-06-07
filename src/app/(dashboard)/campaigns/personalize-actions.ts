"use server";

import { personalizeFromUrl } from "@/lib/ai/personalize";

/** Preview a website-based personalization opener for a single prospect (review before any send). */
export async function previewPersonalizationAction(url: string, context?: { company?: string; vertical?: string }) {
  return personalizeFromUrl(url, context);
}
