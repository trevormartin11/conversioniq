import { NextResponse } from "next/server";
import { DATA_MODE } from "@/lib/config";
import { integrationStatuses } from "@/lib/integrations";

export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json({
    ok: true,
    service: "ciq-hub",
    dataMode: DATA_MODE,
    integrations: integrationStatuses().map((s) => ({ key: s.key, connected: s.connected })),
    time: new Date().toISOString(),
  });
}
