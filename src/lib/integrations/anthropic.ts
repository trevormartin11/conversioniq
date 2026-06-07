/** Anthropic Claude client wrapper — reply classification, drafting, copy ideas. */
import Anthropic from "@anthropic-ai/sdk";
import { appConfig, integrations } from "@/lib/config";
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
  /** Accepted for call-site compatibility, but not sent: newer models (e.g.
   *  Opus 4.8) reject `temperature` as deprecated. */
  temperature?: number;
}

/** Single-turn completion returning plain text. Throws NotConfiguredError if no key. */
export async function complete({ system, user, maxTokens = 1024, fast = false }: CompleteOpts): Promise<string> {
  const msg = await getClient().messages.create({
    model: fast ? appConfig.fastModel : appConfig.model,
    max_tokens: maxTokens,
    system,
    messages: [{ role: "user", content: user }],
  });
  return msg.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();
}

export const aiAvailable = () => integrations.anthropic;
