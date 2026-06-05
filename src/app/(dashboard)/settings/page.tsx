import { CheckCircle2, Circle, ExternalLink, LogOut } from "lucide-react";
import { Card, CardBody, PageHeader, SectionHeader } from "@/components/ui/card";
import { Tag } from "@/components/ui/badge";
import { UserSwitcher } from "@/components/settings/user-switcher";
import { logoutAction } from "@/app/login/actions";
import { getCurrentUser, listPartners } from "@/lib/auth";
import { ensureData, getAutomationLevel } from "@/lib/data/store";
import { integrationStatuses } from "@/lib/integrations";
import { appConfig, DATA_MODE } from "@/lib/config";
import { pct, titleCase } from "@/lib/format";

export const dynamic = "force-dynamic";

const SETUP_STEPS = [
  { k: "supabase", label: "Create a dedicated Supabase project + run db/migrations/0001_init.sql" },
  { k: "instantly", label: "Add INSTANTLY_API_KEY (sending + replies + inbox health)" },
  { k: "zoho", label: "Add Zoho client id/secret + refresh token (canonical CRM + DNC)" },
  { k: "apolloPersonal", label: "Add APOLLO_PERSONAL_API_KEY (search + enrich)" },
  { k: "anthropic", label: "Add ANTHROPIC_API_KEY for AI drafts + copy coach" },
  { k: "telegram", label: "Create a Telegram bot via @BotFather → add token + chat id" },
] as const;

export default async function SettingsPage() {
  await ensureData();
  const user = await getCurrentUser();
  const partners = listPartners();
  const statuses = integrationStatuses();
  const connectedMap = Object.fromEntries(statuses.map((s) => [s.key, s.connected]));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Settings"
        subtitle="Integrations, access, and operating rules."
        action={<Tag tone={DATA_MODE === "live" ? "ok" : "warn"}>{DATA_MODE === "live" ? "Live data" : "Preview / seed data"}</Tag>}
      />

      {/* Acting user */}
      <section>
        <SectionHeader title="Acting as" subtitle="All 3 partners have equal powers. Switch identity, or sign out." />
        <UserSwitcher partners={partners} currentId={user.id} />
        <form action={logoutAction} className="mt-3">
          <button className="inline-flex items-center gap-1.5 rounded-lg border border-ink-700 bg-ink-850 px-3 py-2 text-sm text-slate-300 transition-colors hover:border-ink-600">
            <LogOut className="h-4 w-4" /> Sign out
          </button>
        </form>
      </section>

      {/* Integrations */}
      <section>
        <SectionHeader title="Integrations" />
        <div className="grid gap-2 sm:grid-cols-2">
          {statuses.map((s) => (
            <div key={s.key} className="card flex items-start justify-between gap-2 p-3">
              <div>
                <p className="text-sm text-slate-200">{s.label}</p>
                <p className="text-xs text-slate-500">{s.role}</p>
                {s.note && <p className="mt-0.5 text-[11px] text-warn">{s.note}</p>}
              </div>
              <Tag tone={s.connected ? "ok" : "slate"}>{s.connected ? "On" : "Off"}</Tag>
            </div>
          ))}
        </div>
      </section>

      {/* Setup checklist */}
      <section>
        <SectionHeader title="Go-live checklist" subtitle="See docs/SETUP.md for the full walkthrough" />
        <Card>
          <CardBody className="space-y-2">
            {SETUP_STEPS.map((step) => {
              const done = connectedMap[step.k];
              return (
                <div key={step.k} className="flex items-start gap-2 text-sm">
                  {done ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-ok" /> : <Circle className="mt-0.5 h-4 w-4 shrink-0 text-slate-600" />}
                  <span className={done ? "text-slate-400 line-through" : "text-slate-300"}>{step.label}</span>
                </div>
              );
            })}
          </CardBody>
        </Card>
      </section>

      {/* Operating rules */}
      <section>
        <SectionHeader title="Operating rules" />
        <div className="grid gap-3 sm:grid-cols-2">
          <Card><CardBody>
            <p className="text-xs uppercase tracking-wide text-slate-500">Reply automation</p>
            <p className="mt-1 text-sm font-medium text-slate-100">{titleCase(getAutomationLevel())}</p>
            <p className="mt-1 text-xs text-slate-500">Change it on the Replies screen.</p>
          </CardBody></Card>
          <Card><CardBody>
            <p className="text-xs uppercase tracking-wide text-slate-500">Deliverability guardrails</p>
            <p className="mt-1 text-sm text-slate-200">Warmup gate {appConfig.deliverability.warmupGate} · auto-pause at {pct(appConfig.deliverability.autoPauseBounceRate)} bounce</p>
          </CardBody></Card>
          <Card><CardBody>
            <p className="text-xs uppercase tracking-wide text-slate-500">Residual model</p>
            <p className="mt-1 text-sm text-slate-200">{pct(appConfig.residual.grossRate)} recurring ÷ {appConfig.residual.splitWays} = {pct(appConfig.residual.personalRate, 2)} each</p>
          </CardBody></Card>
          <Card><CardBody>
            <p className="text-xs uppercase tracking-wide text-slate-500">CIQ credits</p>
            <p className="mt-1 text-sm text-slate-200">Hard-gated. Never auto-spent — request → approve → execute, all logged.</p>
          </CardBody></Card>
        </div>
      </section>

      <a href="https://code.claude.com/docs/en/claude-code-on-the-web" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-brand-400 hover:underline">
        Remote environment docs <ExternalLink className="h-3 w-3" />
      </a>
    </div>
  );
}
