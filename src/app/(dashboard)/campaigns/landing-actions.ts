"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth";
import { approveLandingPage, ensureData, generateLandingPage, setLandingConfig, updateLandingContent } from "@/lib/data/store";
import type { LandingContent } from "@/lib/data/types";

function rev() {
  revalidatePath("/campaigns");
}

/** Generate (or regenerate) the landing-page copy for a campaign. Lands in draft for sign-off. */
export async function generateLandingPageAction(campaignId: string) {
  await ensureData();
  const user = await getCurrentUser();
  const p = await generateLandingPage(campaignId, user.name);
  rev();
  return p ? { ok: true as const, id: p.id, source: p.source } : { ok: false as const, error: "Campaign not found." };
}

export async function saveLandingContentAction(campaignId: string, content: LandingContent) {
  await ensureData();
  const user = await getCurrentUser();
  const p = await updateLandingContent(campaignId, content, user.name);
  rev();
  return p ? { ok: true as const } : { ok: false as const, error: "No landing page to save." };
}

export async function approveLandingPageAction(campaignId: string) {
  await ensureData();
  const user = await getCurrentUser();
  const p = await approveLandingPage(campaignId, user.name);
  rev();
  return p ? { ok: true as const } : { ok: false as const, error: "No landing page to approve." };
}

export async function setLandingConfigAction(campaignId: string, cfg: { domain?: string | null; schedulerUrl?: string | null; videoUrl?: string | null }) {
  await ensureData();
  const user = await getCurrentUser();
  const p = await setLandingConfig(campaignId, cfg, user.name);
  rev();
  return p ? { ok: true as const } : { ok: false as const, error: "No landing page." };
}
