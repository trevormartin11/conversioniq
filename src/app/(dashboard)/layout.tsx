import { AppShell } from "@/components/app-shell";
import { getCurrentUser } from "@/lib/auth";
import { dataMode, ensureData, getJobs } from "@/lib/data/store";
import { commandSummary } from "@/lib/data/queries";
import { integrationStatuses } from "@/lib/integrations";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  // The layout renders on EVERY document request — a bare (full) hydration here negated the
  // per-page wins on hard loads. Declared footprint: commandSummary (metrics/replies/inboxes/
  // demos/campaigns) + the nav user + last-sync stamp.
  await ensureData(["users", "jobs", "metrics", "replies", "inboxes", "demos", "campaigns"]);
  const user = await getCurrentUser();
  const summary = commandSummary();
  const statuses = integrationStatuses();
  const connected = statuses.filter((s) => s.connected).length;
  const lastSyncAt = getJobs().map((j) => j.lastRunAt).filter((t): t is string => !!t).sort().pop() ?? null;

  return (
    <AppShell
      user={user}
      dataMode={dataMode()}
      queueCount={summary.queueDepth}
      connectedCount={connected}
      totalIntegrations={statuses.length}
      lastSyncAt={lastSyncAt}
    >
      {children}
    </AppShell>
  );
}
