"use server";

import { dedupeAgainstUniverse, ensureData, isSuppressed, pushAudit, searchUniverse } from "@/lib/data/store";
import { getCurrentUser } from "@/lib/auth";
import { buildPlan, runSourcing } from "@/lib/sourcing/engine";
import type { SizeBand } from "@/lib/sourcing/types";

interface SourcingInput { vertical: string; geo?: string; sizeBand?: SizeBand; count: number; budgetCap: number }
const toTarget = (i: SourcingInput) => ({ vertical: i.vertical.trim(), geo: i.geo?.trim() || undefined, sizeBand: i.sizeBand });

/** Route + cost a sourcing run — ZERO spend. Shows the operator the plan first. */
export async function planSourcingAction(input: SourcingInput) {
  await ensureData();
  if (!input.vertical.trim()) return { ok: false as const, error: "Enter a vertical to target." };
  return { ok: true as const, plan: buildPlan(toTarget(input), input.count, input.budgetCap) };
}

/** Execute the routed pipeline (search -> enrich -> verify -> dedupe). Gated on keys + budget. */
export async function runSourcingAction(input: SourcingInput) {
  await ensureData();
  if (!input.vertical.trim()) return { ok: false as const, plan: null, leads: [], rejected: [], stats: null, error: "Enter a vertical to target." };
  const user = await getCurrentUser();
  const res = await runSourcing(toTarget(input), input.count, input.budgetCap);
  // Audit every real (key-ready) run attempt — the spend record, alongside the platform cap.
  if (res.plan?.ready) {
    await pushAudit(user.name, res.ok ? "sourcing.run" : "sourcing.failed", "sourcing", input.vertical.trim(), {
      provider: res.plan.route.provider,
      count: input.count,
      projectedCost: res.plan.estimate.projectedCost,
      sourced: res.stats?.sourced ?? 0,
      verified: res.stats?.verified ?? 0,
    });
  }
  return res;
}

/** "Have we ever touched this person or domain?" — instant lookup. */
export async function checkTouchedAction(value: string) {
  await ensureData();
  const v = value.trim();
  if (!v) return { ok: false as const };
  const { suppressed, entry } = isSuppressed(v.includes("@") ? v : `x@${v}`);
  const matches = searchUniverse(v);
  return {
    ok: true as const,
    suppressed,
    reason: entry?.reason ?? null,
    leadMatches: matches.leads.slice(0, 5).map((l) => ({ name: `${l.firstName} ${l.lastName}`, email: l.email, company: l.company, status: l.status })),
    suppressionMatches: matches.suppression.length,
  };
}

/**
 * Dedupe a pasted list (one email per line) against the entire contacted + DNC
 * universe BEFORE anyone enters a campaign — the load-time suppression gate.
 */
export async function dedupeListAction(text: string) {
  await ensureData();
  const emails = text
    .split(/[\s,]+/)
    .map((s) => s.trim())
    .filter((s) => s.includes("@"))
    .map((email) => ({ email }));
  const { clean, rejected } = dedupeAgainstUniverse(emails);
  return {
    ok: true as const,
    total: emails.length,
    cleanCount: clean.length,
    rejected: rejected.slice(0, 50),
  };
}
