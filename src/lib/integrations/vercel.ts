/**
 * Vercel project-domain API — attaches a landing-page host (e.g. go.ciqsends.com) to THIS
 * deployed project so Vercel serves it. Requires VERCEL_TOKEN + VERCEL_PROJECT_ID
 * (+ VERCEL_TEAM_ID when the project lives in a team). Publishing is gated on this being
 * configured; without it the publish action explains exactly what to add.
 */
import { httpJson } from "./http";

const BASE = "https://api.vercel.com";

export function vercelConfigured(): boolean {
  return !!(process.env.VERCEL_TOKEN && process.env.VERCEL_PROJECT_ID);
}

/** Add a domain to the project. An already-attached domain counts as success (idempotent). */
export async function addProjectDomain(host: string): Promise<{ ok: boolean; error?: string }> {
  const teamQs = process.env.VERCEL_TEAM_ID ? `?teamId=${encodeURIComponent(process.env.VERCEL_TEAM_ID)}` : "";
  try {
    await httpJson("vercel", `${BASE}/v10/projects/${encodeURIComponent(process.env.VERCEL_PROJECT_ID!)}/domains${teamQs}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.VERCEL_TOKEN}`, "content-type": "application/json" },
      body: JSON.stringify({ name: host }),
    });
    return { ok: true };
  } catch (e) {
    const msg = (e as Error).message;
    // Vercel's literal error code is domain_already_in_use (underscores — the prose-style
    // /already.*in use/ never matched it, so every re-publish failed loudly). Already on
    // THIS project = the state we want; on a DIFFERENT project = a real conflict.
    if (/domain_already_in_use/i.test(msg)) {
      return msg.includes(process.env.VERCEL_PROJECT_ID!)
        ? { ok: true }
        : { ok: false, error: `${host} is attached to a different Vercel project — detach it there, then publish again. (${msg})` };
    }
    if (/already.*(in use|exists|added)/i.test(msg) || /\b409\b/.test(msg)) return { ok: true };
    return { ok: false, error: msg };
  }
}
