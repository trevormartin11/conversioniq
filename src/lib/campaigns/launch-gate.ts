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
    // Assigned ids that ALL fail to resolve to a hub inbox is a HARD block, not an overridable
    // warmup warning: a warmup override is a judgment call about under-warmed inboxes, never a
    // licence to launch with zero resolvable inboxes (every assigned id vanished from the fleet).
    const resolvable = new Set(opts.inboxes.map((i) => i.id));
    if (!c.inboxIds.some((id) => resolvable.has(id)))
      return { reason: "no_inboxes", message: "None of the assigned sending inboxes resolve to a hub inbox anymore (deleted/renamed in sync) — reassign before launching." };
  }
  // Never start sending from under-warmed / inactive inboxes — that burns the fleet. (Overridable.)
  // Iterate the ASSIGNED ids (not the resolvable inboxes): an id that no longer resolves to a hub
  // inbox (deleted/renamed by sync, slug change) is treated as unfit — fail closed, not skipped.
  const byId = new Map(opts.inboxes.map((i) => [i.id, i]));
  const unfit = c.inboxIds.filter((id) => {
    const i = byId.get(id);
    return !i || i.status !== "active" || i.warmupScore < opts.warmupGate;
  });
  if (unfit.length) {
    const names = unfit.slice(0, 3).map((id) => byId.get(id)?.email ?? id).join(", ");
    return {
      reason: "warmup",
      message: `${unfit.length} assigned inbox${unfit.length > 1 ? "es are" : " is"} under warmup ${opts.warmupGate}, not active, or unknown (${names}${unfit.length > 3 ? "…" : ""}). Launching now risks the fleet.`,
    };
  }
  return null;
}
