import { AppShell } from "@/components/app-shell";
import { getCurrentUser } from "@/lib/auth";
import { dataMode, ensureData, getJobs } from "@/lib/data/store";
import { commandSummary } from "@/lib/data/queries";
import { integrationStatuses } from "@/lib/integrations";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  await ensureData();
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
