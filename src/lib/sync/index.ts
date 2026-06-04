/** Orchestrates the data syncs (Instantly + Zoho -> hub DB). */
import { syncInboxes } from "./inboxes";
import { syncLeads } from "./leads";

export async function runAllSyncs() {
  const result: Record<string, unknown> = {};
  const errors: string[] = [];
  try {
    result.inboxes = await syncInboxes();
  } catch (e) {
    errors.push(`inboxes: ${(e as Error).message}`);
  }
  try {
    result.leads = await syncLeads();
  } catch (e) {
    errors.push(`leads: ${(e as Error).message}`);
  }
  return { ok: errors.length === 0, ...result, errors, ranAt: new Date().toISOString() };
}
