import { Lock } from "lucide-react";
import { Card, CardBody, SectionHeader } from "@/components/ui/card";
import { Progress } from "@/components/ui/charts";
import { CreditControls, type RequestView } from "@/components/credits/credit-controls";
import { creditSummary } from "@/lib/data/queries";
import { ensureData, getAudit, getCreditRequests } from "@/lib/data/store";
import { getCurrentUser } from "@/lib/auth";
import { ago, num, pct } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function CreditsPage() {
  await ensureData();
  const meters = creditSummary();
  const requests: RequestView[] = getCreditRequests().map((r) => ({
    id: r.id,
    amount: r.amount,
    reason: r.reason,
    requestedBy: r.requestedBy,
    status: r.status,
    createdAt: r.createdAt,
  }));
  const user = await getCurrentUser();
  const creditAudit = getAudit().filter((a) => a.entity === "apollo_ciq").slice(0, 8);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-100">Credit Guard</h1>
        <p className="text-sm text-slate-500">Live Apollo credit meters. CIQ credits are gated — never auto-spent.</p>
      </div>

      {/* Meters */}
      <div className="grid gap-3 sm:grid-cols-2">
        {meters.map((m) => (
          <Card key={m.provider}>
            <CardBody>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold text-slate-100">{m.label}</p>
                  <p className="text-xs text-slate-500">Resets {ago(m.resetsAt)}</p>
                </div>
                {m.gated && (
                  <span className="chip bg-bad/15 text-bad"><Lock className="h-3 w-3" /> Gated</span>
                )}
              </div>
              <div className="mt-3 flex items-end justify-between">
                <span className="text-2xl font-semibold tabular-nums text-slate-100">{num(m.remaining)}</span>
                <span className="text-xs text-slate-500">{num(m.used)} / {num(m.total)} used · {pct(m.pctUsed, 0)}</span>
              </div>
              <div className="mt-2">
                <Progress value={m.pctUsed} tone={m.pctUsed > 0.85 ? "bad" : m.pctUsed > 0.6 ? "warn" : "ok"} />
              </div>
            </CardBody>
          </Card>
        ))}
      </div>

      {/* Gated controls */}
      <section>
        <SectionHeader title="CIQ credit spend" subtitle="Request → partner approval → execute. Every spend is logged." />
        <CreditControls requests={requests} currentUser={user.name} />
      </section>

      {/* Audit */}
      <section>
        <SectionHeader title="Spend audit log" />
        <Card>
          <CardBody className="space-y-2">
            {creditAudit.length === 0 && <p className="text-sm text-slate-500">No CIQ credit activity yet.</p>}
            {creditAudit.map((a) => (
              <div key={a.id} className="flex items-center justify-between border-b border-ink-800 py-2 text-xs last:border-0">
                <span className="text-slate-300">
                  <span className="font-medium text-slate-100">{a.actor}</span> · {a.action.replace("credit.", "")}
                  {typeof a.meta.amount === "number" && <span className="text-slate-500"> · {num(a.meta.amount)} credits</span>}
                </span>
                <span className="text-slate-600">{ago(a.createdAt)}</span>
              </div>
            ))}
          </CardBody>
        </Card>
      </section>
    </div>
  );
}
