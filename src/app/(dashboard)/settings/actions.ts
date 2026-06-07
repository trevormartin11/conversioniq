"use server";

import { checkConnections } from "@/lib/integrations/healthcheck";
import { ensureData, setAssumptions } from "@/lib/data/store";

/** Operator-initiated live connection test. Gated by the app login (page route). */
export async function testConnectionsAction() {
  return checkConnections();
}

/** Save the operator-set forward-projection assumptions (close rate + avg MRR). */
export async function saveAssumptionsAction(input: { closeRate: number; monthlyMrr: number }) {
  try {
    await ensureData();
    const assumptions = await setAssumptions(input);
    return { ok: true as const, assumptions };
  } catch (e) {
    return { ok: false as const, error: (e as Error).message };
  }
}
