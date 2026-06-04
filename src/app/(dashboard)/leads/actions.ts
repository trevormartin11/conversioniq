"use server";

import { dedupeAgainstUniverse, ensureData, isSuppressed, searchUniverse } from "@/lib/data/store";

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
