/**
 * Gmail client — reply FALLBACK source + exports.
 *
 * Primary reply source is Instantly's unibox (Instantly is connected to the
 * Gmail inboxes), so this is a secondary path used only if we need to read a
 * mailbox directly. Implemented as a thin OAuth wrapper; expand as needed.
 */
import { integrations } from "@/lib/config";
import { httpJson, NotConfiguredError } from "./http";

let cachedToken: { token: string; expiresAt: number } | null = null;

async function accessToken(): Promise<string> {
  if (!integrations.gmail) throw new NotConfiguredError("gmail");
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) return cachedToken.token;
  const params = new URLSearchParams({
    client_id: process.env.GMAIL_CLIENT_ID!,
    client_secret: process.env.GMAIL_CLIENT_SECRET!,
    refresh_token: process.env.GMAIL_REFRESH_TOKEN!,
    grant_type: "refresh_token",
  });
  const data = await httpJson<{ access_token: string; expires_in: number }>(
    "gmail",
    "https://oauth2.googleapis.com/token",
    { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: params.toString() },
  );
  cachedToken = { token: data.access_token, expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000 };
  return cachedToken.token;
}

export async function listRecentMessages(query = "newer_than:2d", userId = "me"): Promise<unknown[]> {
  const token = await accessToken();
  const qs = new URLSearchParams({ q: query, maxResults: "50" });
  const data = await httpJson<{ messages?: unknown[] }>(
    "gmail",
    `https://gmail.googleapis.com/gmail/v1/users/${userId}/messages?${qs}`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  return data.messages ?? [];
}

/** Send a plain-text email from the connected Gmail account (e.g. demo reminders). */
export async function sendEmail(input: { to: string; subject: string; bodyText: string; fromName?: string; fromEmail?: string }): Promise<{ id: string }> {
  const token = await accessToken();
  const from = input.fromEmail ? (input.fromName ? `${input.fromName} <${input.fromEmail}>` : input.fromEmail) : null;
  const headers = [
    `To: ${input.to}`,
    from ? `From: ${from}` : null,
    `Subject: ${input.subject}`,
    "MIME-Version: 1.0",
    'Content-Type: text/plain; charset="UTF-8"',
  ].filter(Boolean).join("\r\n");
  const mime = `${headers}\r\n\r\n${input.bodyText}`;
  const raw = Buffer.from(mime, "utf-8").toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const data = await httpJson<{ id: string }>(
    "gmail",
    "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
    { method: "POST", headers: { Authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify({ raw }) },
  );
  return { id: data.id };
}

export function assertGmail() {
  if (!integrations.gmail) throw new NotConfiguredError("gmail");
}
