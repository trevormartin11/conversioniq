import { AppShell } from "@/components/app-shell";
import { getCurrentUser } from "@/lib/auth";
import { dataMode } from "@/lib/data/store";
import { commandSummary } from "@/lib/data/queries";
import { integrationStatuses } from "@/lib/integrations";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  const summary = commandSummary();
  const statuses = integrationStatuses();
  const connected = statuses.filter((s) => s.connected).length;

  return (
    <AppShell
      user={user}
      dataMode={dataMode()}
      queueCount={summary.queueDepth}
      connectedCount={connected}
      totalIntegrations={statuses.length}
    >
      {children}
    </AppShell>
  );
}
