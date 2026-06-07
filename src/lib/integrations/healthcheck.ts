/**
 * Live connection self-test.
 *
 * For each *configured* integration we run a single, read-only, ZERO-COST probe and
 * report whether the credentials actually work — not just whether the key is present
 * (the gap that lets a pasted grant code masquerade as a refresh token, or a key sit
 * unverified). It never performs a billable action: the Apollo CIQ probe only hits the
 * free `auth/health` endpoint, never a search/enrich/match call — that spend stays
 * hard-gated elsewhere. Providers without a known zero-cost probe stay presence-only.
 */
import type { IntegrationKey } from "@/lib/config";
import { integrationStatuses } from "@/lib/integrations";

export interface ConnResult {
  key: IntegrationKey;
  label: string;
  configured: boolean;
  /** true = live call succeeded, false = failed, null = not tested (unconfigured or no safe probe). */
  ok: boolean | null;
  detail: string;
  ms: number | null;
}

async function probeFetch(url: string, init: RequestInit = {}, timeoutMs = 8000): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...init, signal: ctrl.signal });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`HTTP ${res.status}${body ? `: ${body.slice(0, 120)}` : ""}`);
    }
    return res;
  } catch (e) {
    if ((e as Error).name === "AbortError") throw new Error(`timed out after ${timeoutMs}ms`);
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

/** Mint an access token from a refresh token — the cheapest read-only proof the OAuth creds work. */
async function zohoMint(prefix: "ZOHO" | "ZOHO_CIQ"): Promise<string> {
  const accounts = (process.env[`${prefix}_ACCOUNTS_URL`] || "https://accounts.zoho.com").replace(/\/+$/, "");
  const res = await probeFetch(`${accounts}/oauth/v2/token`, {
    method: "POST",
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: process.env[`${prefix}_REFRESH_TOKEN`] ?? "",
      client_id: process.env[`${prefix}_CLIENT_ID`] ?? "",
      client_secret: process.env[`${prefix}_CLIENT_SECRET`] ?? "",
    }),
  });
  // Zoho returns HTTP 200 even for bad creds, with an { error } body — so check the payload.
  const j = (await res.json().catch(() => ({}))) as { access_token?: string; error?: string };
  if (!j.access_token) throw new Error(j.error || "no access_token returned");
  return "access token minted";
}

/** Apollo: the FREE auth/health check only. Never a billable search/enrich/match call. */
async function apolloHealth(key: string | undefined): Promise<string> {
  const res = await probeFetch(`https://api.apollo.io/v1/auth/health?api_key=${encodeURIComponent(key ?? "")}`, {
    headers: { "X-Api-Key": key ?? "", "Content-Type": "application/json" },
  });
  const j = (await res.json().catch(() => ({}))) as { is_logged_in?: boolean };
  if (j.is_logged_in === false) throw new Error("API key rejected");
  return "key valid";
}

/**
 * Per-integration probes. A missing entry means "configured but no zero-cost live test".
 * Exported so the safety invariants (e.g. Apollo CIQ never hits a billable endpoint) are testable.
 */
export const probes: Partial<Record<IntegrationKey, () => Promise<string>>> = {
  supabase: async () => {
    const url = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").replace(/\/+$/, "");
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
    await probeFetch(`${url}/rest/v1/`, { headers: { apikey: key, Authorization: `Bearer ${key}` } });
    return "URL + anon key valid";
  },
  anthropic: async () => {
    await probeFetch("https://api.anthropic.com/v1/models?limit=1", {
      headers: { "x-api-key": process.env.ANTHROPIC_API_KEY ?? "", "anthropic-version": "2023-06-01" },
    });
    return "key valid";
  },
  instantly: async () => {
    await probeFetch("https://api.instantly.ai/api/v2/campaigns?limit=1", {
      headers: { Authorization: `Bearer ${process.env.INSTANTLY_API_KEY ?? ""}` },
    });
    return "key valid";
  },
  zoho: () => zohoMint("ZOHO"),
  zohoCiq: () => zohoMint("ZOHO_CIQ"),
  apolloPersonal: () => apolloHealth(process.env.APOLLO_PERSONAL_API_KEY),
  apolloCiq: () => apolloHealth(process.env.APOLLO_CIQ_API_KEY),
  millionverifier: async () => {
    const res = await probeFetch(
      `https://api.millionverifier.com/api/v3/credits?api=${encodeURIComponent(process.env.MILLIONVERIFIER_API_KEY ?? "")}`,
    );
    const j = (await res.json().catch(() => ({}))) as { credits?: number; error?: string };
    if (j.error) throw new Error(String(j.error));
    return typeof j.credits === "number" ? `${j.credits.toLocaleString()} credits left` : "key valid";
  },
  gmail: async () => {
    const res = await probeFetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: process.env.GMAIL_REFRESH_TOKEN ?? "",
        client_id: process.env.GMAIL_CLIENT_ID ?? "",
        client_secret: process.env.GMAIL_CLIENT_SECRET ?? "",
      }),
    });
    const j = (await res.json().catch(() => ({}))) as { access_token?: string; error?: string };
    if (!j.access_token) throw new Error(j.error || "no access_token returned");
    return "access token minted";
  },
  twilio: async () => {
    // GET the account resource — a free, read-only call that proves the SID + token work.
    const sid = process.env.TWILIO_ACCOUNT_SID ?? "";
    const res = await probeFetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}.json`, {
      headers: { Authorization: `Basic ${Buffer.from(`${sid}:${process.env.TWILIO_AUTH_TOKEN ?? ""}`).toString("base64")}` },
    });
    const j = (await res.json().catch(() => ({}))) as { friendly_name?: string; status?: string };
    return j.friendly_name ? `account: ${j.friendly_name}` : "credentials valid";
  },
  telegram: async () => {
    const res = await probeFetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN ?? ""}/getMe`);
    const j = (await res.json().catch(() => ({}))) as { ok?: boolean; description?: string; result?: { username?: string } };
    if (!j.ok) throw new Error(j.description || "getMe failed");
    return j.result?.username ? `@${j.result.username}` : "bot token valid";
  },
  // outscraper / findymail / lusha / namecheap: no documented zero-cost probe that avoids a
  // billable request (or, for Namecheap, a static-IP allowlist) — left presence-only on purpose.
};

/** Run a live probe for every configured integration, in parallel, never throwing. */
export async function checkConnections(): Promise<ConnResult[]> {
  const items = integrationStatuses().filter((s) => s.key !== "dataMode") as {
    key: IntegrationKey;
    label: string;
    connected: boolean;
  }[];
  return Promise.all(
    items.map(async ({ key, label, connected }) => {
      if (!connected) return { key, label, configured: false, ok: null, detail: "not configured", ms: null };
      const probe = probes[key];
      if (!probe) return { key, label, configured: true, ok: null, detail: "configured — no zero-cost live test", ms: null };
      const start = Date.now();
      try {
        const detail = await probe();
        return { key, label, configured: true, ok: true, detail, ms: Date.now() - start };
      } catch (e) {
        return { key, label, configured: true, ok: false, detail: (e as Error).message.slice(0, 200), ms: Date.now() - start };
      }
    }),
  );
}
