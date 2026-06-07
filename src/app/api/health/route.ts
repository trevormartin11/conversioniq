import { NextRequest, NextResponse } from "next/server";
import { DATA_MODE } from "@/lib/config";
import { integrationStatuses } from "@/lib/integrations";
import { supabaseAdmin } from "@/lib/data/supabase";

export const dynamic = "force-dynamic";

/** Does this table (and optional column) exist? Uses a head/count query — reads no rows. */
async function probe(table: string, column = "id"): Promise<{ ok: boolean; error?: string }> {
  try {
    const { error } = await supabaseAdmin().from(table).select(column, { head: true, count: "exact" });
    return error ? { ok: false, error: error.message } : { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

/** Confirms the migrations this session added are applied to the live DB. */
async function checkSchema() {
  const [consent, accounts, outreach, demoDeal, demoOutcome, demoReminder] = await Promise.all([
    probe("consent_records"),
    probe("channel_accounts"),
    probe("outreach_messages"),
    probe("demos", "civ_deal_id"),
    probe("demos", "outcome_reason"),
    probe("demos", "reminder_sent_at"),
  ]);
  return {
    "0004_channels": { consent_records: consent, channel_accounts: accounts, outreach_messages: outreach },
    "0005_schema_fixes": { "demos.civ_deal_id": demoDeal, "demos.outcome_reason": demoOutcome, "demos.reminder_sent_at": demoReminder },
  };
}

export async function GET(req: NextRequest) {
  const body: Record<string, unknown> = {
    ok: true,
    service: "ciq-hub",
    dataMode: DATA_MODE,
    integrations: integrationStatuses().map((s) => ({ key: s.key, connected: s.connected })),
    time: new Date().toISOString(),
  };
  // ?schema=1 → probe that this session's migrations (0004/0005) are applied (live mode only).
  if (req.nextUrl.searchParams.get("schema") && DATA_MODE === "live") {
    body.schema = await checkSchema();
  }
  return NextResponse.json(body);
}
