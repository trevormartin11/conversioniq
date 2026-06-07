/** Anthropic Claude client wrapper — reply classification, drafting, copy ideas. */
import Anthropic from "@anthropic-ai/sdk";
import { appConfig, integrations } from "@/lib/config";
import { recordAiUsage, type AiPurpose } from "@/lib/ai/usage";
import { NotConfiguredError } from "./http";

let client: Anthropic | null = null;

function getClient(): Anthropic {
  if (!integrations.anthropic) throw new NotConfiguredError("anthropic");
  if (!client) client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return client;
}

export interface CompleteOpts {
  system: string;
  user: string;
  maxTokens?: number;
  /** Route to the cheap/fast model (appConfig.fastModel) instead of the premium one.
   *  Use for high-frequency, low-complexity calls (e.g. reply classification). */
  fast?: boolean;
  /** What this call is for — tags the spend so the live cost meter can break it down. */
  purpose?: AiPurpose;
  /** Accepted for call-site compatibility, but not sent: newer models (e.g.
   *  Opus 4.8) reject `temperature` as deprecated. */
  temperature?: number;
}

/** Single-turn completion returning plain text. Throws NotConfiguredError if no key. */
export async function complete({ system, user, maxTokens = 1024, fast = false, purpose = "other" }: CompleteOpts): Promise<string> {
  const model = fast ? appConfig.fastModel : appConfig.model;
  const msg = await getClient().messages.create({
    model,
    max_tokens: maxTokens,
    system,
    messages: [{ role: "user", content: user }],
  });
  // Meter the spend (best-effort; never blocks the result on failure). Cache fields aren't
  // typed in this SDK version and we don't use prompt caching, so read them loosely.
  const usage = (msg.usage ?? {}) as {
    input_tokens?: number;
    output_tokens?: number;
    cache_read_input_tokens?: number;
    cache_creation_input_tokens?: number;
  };
  await recordAiUsage({
    model,
    purpose,
    inputTokens: usage.input_tokens ?? 0,
    outputTokens: usage.output_tokens ?? 0,
    cacheReadTokens: usage.cache_read_input_tokens ?? 0,
    cacheCreationTokens: usage.cache_creation_input_tokens ?? 0,
  });
  return msg.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();
}

export const aiAvailable = () => integrations.anthropic;
