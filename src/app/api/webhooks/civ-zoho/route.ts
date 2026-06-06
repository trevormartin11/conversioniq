import { NextRequest, NextResponse } from "next/server";
import { ensureData, getDemoByCivDealId, recordDemoOutcome } from "@/lib/data/store";
import { classifyStage, mapLostReason } from "@/lib/outcome";

/**
 * Inbound webhook from ConversionIQ's Zoho org. A workflow there fires this when a
 * Deal we created (on demo booked) moves to a won/lost stage — closing the learning
 * loop without anyone re-keying. Secret-protected; map the won/lost stage names to
 * your pipeline via ZOHO_CIQ_WON_STAGE / ZOHO_CIQ_LOST_STAGE.
 */
export async function POST(req: NextRequest) {
  const secret = process.env.CIQ_ZOHO_WEBHOOK_SECRET;
  if (secret) {
    const provided = req.headers.get("x-webhook-secret") || req.nextUrl.searchParams.get("secret");
    if (provided !== secret) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  let payload: Record<string, unknown> = {};
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid json" }, { status: 400 });
  }

  const dealId = String(payload.deal_id ?? payload.id ?? payload.Deal_Id ?? payload.dealId ?? "").trim();
  const stage = String(payload.stage ?? payload.Stage ?? "").trim();
  if (!dealId) return NextResponse.json({ ok: true, ignored: "no deal id" });

  const cls = classifyStage(stage);
  if (!cls) return NextResponse.json({ ok: true, ignored: stage || "non-terminal stage" });
  const isWon = cls === "won";

  await ensureData();
  const demo = getDemoByCivDealId(dealId);
  if (!demo) return NextResponse.json({ ok: true, ignored: "no matching demo", dealId });

  if (isWon) {
    const amount = payload.amount ?? payload.Amount ?? payload.mrr ?? payload.MRR;
    const mrr = amount == null ? undefined : Number(amount);
    await recordDemoOutcome(demo.id, { result: "won", mrr: Number.isFinite(mrr) ? mrr : undefined }, "ConversionIQ");
    return NextResponse.json({ ok: true, recorded: "won", demoId: demo.id });
  }

  const raw = String(payload.reason ?? payload.Lost_Reason ?? payload.loss_reason ?? payload.Reason ?? "");
  const { reason, note } = mapLostReason(raw);
  await recordDemoOutcome(demo.id, { result: "lost", reason, note }, "ConversionIQ");
  return NextResponse.json({ ok: true, recorded: "lost", reason, demoId: demo.id });
}
