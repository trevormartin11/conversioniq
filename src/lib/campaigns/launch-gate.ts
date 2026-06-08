/**
 * Launch gate — decides whether a campaign may flip to "active". Pure + testable; the server action
 * wraps it. The key correctness rule: when Instantly is the live sender, a campaign can only truly send
 * if it's linked to an Instantly campaign with at least one assigned inbox — otherwise "Launch" would
 * report success while sending nothing. In mock/preview mode there's no real sender, so sends simulate
 * and only the warmup guard applies.
 */
import type { Campaign, Inbox } from "@/lib/data/types";

export type LaunchBlockReason = "not_live" | "no_inboxes" | "warmup";
export interface LaunchBlock {
  reason: LaunchBlockReason;
  message: string;
}

export function launchBlocker(
  c: Campaign,
  opts: { instantlyConnected: boolean; warmupGate: number; inboxes: Inbox[] },
): LaunchBlock | null {
  // Can it actually send? Only enforced when Instantly is the live sender.
  if (opts.instantlyConnected) {
    if (!c.instantlyCampaignId)
      return { reason: "not_live", message: "This campaign isn't on Instantly yet — open it and push to Instantly (assign sending inboxes) before launching." };
    if (c.inboxIds.length === 0)
      return { reason: "no_inboxes", message: "No sending inboxes are assigned — assign at least one before launching." };
  }
  // Never start sending from under-warmed / inactive inboxes — that burns the fleet. (Overridable.)
  const unfit = opts.inboxes.filter((i) => c.inboxIds.includes(i.id) && (i.status !== "active" || i.warmupScore < opts.warmupGate));
  if (unfit.length) {
    const names = unfit.slice(0, 3).map((i) => i.email).join(", ");
    return {
      reason: "warmup",
      message: `${unfit.length} assigned inbox${unfit.length > 1 ? "es are" : " is"} under warmup ${opts.warmupGate} or not active (${names}${unfit.length > 3 ? "…" : ""}). Launching now risks the fleet.`,
    };
  }
  return null;
}
