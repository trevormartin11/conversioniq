/** Telegram alerts — hot replies (instant) + daily digest. */
import { integrations } from "@/lib/config";
import { httpJson, NotConfiguredError } from "./http";

const BASE = "https://api.telegram.org";

/** Escape Telegram Markdown specials in untrusted text (inbound reply bodies, sender names) —
 *  a hostile sender could otherwise inject links/formatting into the operator's alert, and
 *  unbalanced markup makes Telegram reject the message (alert silently lost). */
export function tgEscape(text: string): string {
  return text.replace(/([_*[\]`])/g, "\\$1");
}

export async function sendTelegram(text: string): Promise<{ ok: boolean; reason?: string }> {
  if (!integrations.telegram) {
    // Soft-fail: alerts are non-critical and shouldn't break a flow.
    return { ok: false, reason: "telegram not configured" };
  }
  const token = process.env.TELEGRAM_BOT_TOKEN!;
  const chatId = process.env.TELEGRAM_CHAT_ID!;
  try {
    await httpJson("telegram", `${BASE}/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: "Markdown", disable_web_page_preview: true }),
    });
    return { ok: true };
  } catch (err) {
    return { ok: false, reason: (err as Error).message };
  }
}

export function assertTelegram() {
  if (!integrations.telegram) throw new NotConfiguredError("telegram");
}
