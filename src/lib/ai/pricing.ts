/**
 * Claude pricing — list-price ESTIMATES (USD per million tokens) used to turn token
 * usage into a dollar figure for the live spend meter. These are estimates and can
 * drift as Anthropic updates pricing — adjust the table if they change. An unknown
 * model falls back to the premium tier so we never UNDER-report spend.
 */
export interface ModelPricing {
  inputPerMtok: number;
  outputPerMtok: number;
  cacheReadPerMtok: number;
  cacheWritePerMtok: number;
}

const TABLE: { test: (m: string) => boolean; price: ModelPricing }[] = [
  { test: (m) => m.includes("opus"), price: { inputPerMtok: 15, outputPerMtok: 75, cacheReadPerMtok: 1.5, cacheWritePerMtok: 18.75 } },
  { test: (m) => m.includes("sonnet"), price: { inputPerMtok: 3, outputPerMtok: 15, cacheReadPerMtok: 0.3, cacheWritePerMtok: 3.75 } },
  { test: (m) => m.includes("haiku"), price: { inputPerMtok: 1, outputPerMtok: 5, cacheReadPerMtok: 0.1, cacheWritePerMtok: 1.25 } },
];

// Unknown model → assume premium so the meter errs high, never low.
const PREMIUM_FALLBACK: ModelPricing = { inputPerMtok: 15, outputPerMtok: 75, cacheReadPerMtok: 1.5, cacheWritePerMtok: 18.75 };

export function pricingFor(model: string): ModelPricing {
  const m = (model || "").toLowerCase();
  return TABLE.find((t) => t.test(m))?.price ?? PREMIUM_FALLBACK;
}

export interface TokenUsage {
  input: number;
  output: number;
  cacheRead?: number;
  cacheWrite?: number;
}

/** Estimated USD for one completion given its model + token usage. */
export function costUsd(model: string, u: TokenUsage): number {
  const p = pricingFor(model);
  const c =
    (u.input / 1e6) * p.inputPerMtok +
    (u.output / 1e6) * p.outputPerMtok +
    ((u.cacheRead ?? 0) / 1e6) * p.cacheReadPerMtok +
    ((u.cacheWrite ?? 0) / 1e6) * p.cacheWritePerMtok;
  return Math.max(0, c);
}
