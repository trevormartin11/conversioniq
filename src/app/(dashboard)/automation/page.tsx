import { CheckCircle2, Circle, XCircle } from "lucide-react";
import { Card, CardBody, PageHeader, SectionHeader } from "@/components/ui/card";
import { Tag } from "@/components/ui/badge";
import { ensureData, getAudit, getJobs } from "@/lib/data/store";
import { integrationStatuses } from "@/lib/integrations";
import { ago, titleCase } from "@/lib/format";

export const dynamic = "force-dynamic";

const JOB_LABELS: Record<string, string> = {
  sync_replies: "Sync replies (Instantly unibox → hub)",
  list_refill: "List refill + dedupe against suppression",
  daily_brief: "Daily brief (Telegram digest)",
  weekly_report: "Weekly report",
};

export default async function AutomationPage() {
  await ensureData();
  const jobs = getJobs();
  const statuses = integrationStatuses();
  const audit = getAudit().slice(0, 12);

  return (
    <div className="space-y-6">
      <PageHeader title="Automation Status" subtitle="Scheduled jobs, integration health, and the activity log." />

      {/* Jobs */}
      <section>
        <SectionHeader title="Scheduled jobs" />
        <Card>
          <CardBody className="p-0">
            <div className="divide-y divide-ink-800">
              {jobs.length === 0 && <p className="px-4 py-6 text-center text-sm text-slate-500">No job runs yet — they appear after the first cron/sync.</p>}
              {jobs.map((j) => (
                <div key={j.id} className="flex items-center justify-between gap-3 px-4 py-3">
                  <div className="flex items-center gap-3">
                    {j.status === "ok" ? <CheckCircle2 className="h-4 w-4 text-ok" /> : j.status === "error" ? <XCircle className="h-4 w-4 text-bad" /> : <Circle className="h-4 w-4 text-warn" />}
                    <div>
                      <p className="text-sm text-slate-200">{JOB_LABELS[j.job] ?? titleCase(j.job)}</p>
                      <p className="text-xs text-slate-500">Last run {ago(j.lastRunAt)} · next {j.nextRunAt ? ago(j.nextRunAt).replace(" ago", "") : "—"}</p>
                    </div>
                  </div>
                  <Tag tone={j.status === "ok" ? "ok" : j.status === "error" ? "bad" : "warn"}>{j.status}</Tag>
                </div>
              ))}
            </div>
          </CardBody>
        </Card>
      </section>

      {/* Integrations */}
      <section>
        <SectionHeader title="Integrations" subtitle="Connect keys in Settings to go live" />
        <div className="grid gap-2 sm:grid-cols-2">
          {statuses.map((s) => (
            <div key={s.key} className="card flex items-center justify-between p-3">
              <div>
                <p className="text-sm text-slate-200">{s.label}</p>
                <p className="text-xs text-slate-500">{s.role}</p>
              </div>
              <Tag tone={s.connected ? "ok" : "slate"}>{s.connected ? "Connected" : "Not set"}</Tag>
            </div>
          ))}
        </div>
      </section>

      {/* Activity log */}
      <section>
        <SectionHeader title="Activity log" />
        <Card>
          <CardBody className="space-y-1.5">
            {audit.length === 0 && <p className="px-4 py-6 text-center text-sm text-slate-500">No activity yet.</p>}
            {audit.map((a) => (
              <div key={a.id} className="flex items-center justify-between border-b border-ink-800 py-1.5 text-xs last:border-0">
                <span className="text-slate-300"><span className="font-medium text-slate-100">{a.actor}</span> · {a.action}</span>
                <span className="text-slate-600">{ago(a.createdAt)}</span>
              </div>
            ))}
          </CardBody>
        </Card>
      </section>
    </div>
  );
}
