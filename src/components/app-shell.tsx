"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X, Radio } from "lucide-react";
import { NAV, PRIMARY_HREFS } from "@/lib/nav";
import { cn } from "@/lib/utils";
import { ago } from "@/lib/format";
import { Toaster } from "@/components/ui/toast";
import type { User } from "@/lib/data/types";

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

export function AppShell({
  user,
  dataMode,
  queueCount,
  connectedCount,
  totalIntegrations,
  lastSyncAt,
  children,
}: {
  user: User;
  dataMode: "live" | "mock";
  queueCount: number;
  connectedCount: number;
  totalIntegrations: number;
  lastSyncAt: string | null;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [drawer, setDrawer] = useState(false);
  const primary = NAV.filter((n) => PRIMARY_HREFS.includes(n.href));

  return (
    <div className="min-h-screen md:flex">
      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-ink-800 bg-ink-900/60 px-3 py-4 md:flex">
        <Brand />
        <nav className="mt-6 flex flex-1 flex-col gap-1">
          {NAV.map((item) => (
            <NavLink key={item.href} item={item} active={isActive(pathname, item.href)} badge={item.href === "/replies" ? queueCount : undefined} />
          ))}
        </nav>
        <DataModePill dataMode={dataMode} connectedCount={connectedCount} totalIntegrations={totalIntegrations} lastSyncAt={lastSyncAt} />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Top bar */}
        <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b border-ink-800 bg-ink-950/80 px-3 backdrop-blur md:px-6">
          <button className="rounded-lg p-2 text-slate-300 hover:bg-ink-800 md:hidden" onClick={() => setDrawer(true)} aria-label="Open menu">
            <Menu className="h-5 w-5" />
          </button>
          <div className="md:hidden"><Brand compact /></div>
          <div className="ml-auto flex items-center gap-3">
            <span className="hidden items-center gap-1.5 rounded-full bg-white/5 px-2.5 py-1 text-xs text-slate-300 sm:inline-flex">
              <span className={cn("h-1.5 w-1.5 rounded-full", dataMode === "live" ? "bg-ok" : "bg-warn")} />
              {dataMode === "live" ? "Live" : "Preview"}
            </span>
            <UserChip user={user} />
          </div>
        </header>

        <main className="mx-auto w-full max-w-5xl flex-1 px-3 pb-28 pt-4 md:px-6 md:pb-10">{children}</main>
      </div>

      {/* Mobile bottom tabs */}
      <nav className="fixed inset-x-0 bottom-0 z-20 grid grid-cols-5 border-t border-ink-800 bg-ink-950/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
        {primary.map((item) => (
          <TabLink key={item.href} item={item} active={isActive(pathname, item.href)} badge={item.href === "/replies" ? queueCount : undefined} />
        ))}
        <button className="flex flex-col items-center justify-center gap-0.5 py-2 text-[10px] text-slate-400" onClick={() => setDrawer(true)}>
          <Menu className="h-5 w-5" />
          More
        </button>
      </nav>

      <Toaster />

      {/* Mobile drawer */}
      {drawer && (
        <div className="fixed inset-0 z-40 md:hidden" onClick={() => setDrawer(false)}>
          <div className="absolute inset-0 bg-black/60" />
          <div className="absolute left-0 top-0 h-full w-72 bg-ink-900 p-4 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <Brand />
              <button className="rounded-lg p-2 text-slate-400 hover:bg-ink-800" onClick={() => setDrawer(false)} aria-label="Close menu">
                <X className="h-5 w-5" />
              </button>
            </div>
            <nav className="mt-5 flex flex-col gap-1">
              {NAV.map((item) => (
                <NavLink key={item.href} item={item} active={isActive(pathname, item.href)} onClick={() => setDrawer(false)} badge={item.href === "/replies" ? queueCount : undefined} />
              ))}
            </nav>
            <div className="mt-5"><DataModePill dataMode={dataMode} connectedCount={connectedCount} totalIntegrations={totalIntegrations} lastSyncAt={lastSyncAt} /></div>
          </div>
        </div>
      )}
    </div>
  );
}

function Brand({ compact }: { compact?: boolean }) {
  return (
    <Link href="/" className="flex items-center gap-2">
      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600 text-white">
        <Radio className="h-4 w-4" />
      </span>
      {!compact && (
        <span className="text-sm font-semibold tracking-tight text-slate-100">
          CIQ <span className="text-slate-400">Hub</span>
        </span>
      )}
    </Link>
  );
}

function NavLink({ item, active, badge, onClick }: { item: (typeof NAV)[number]; active: boolean; badge?: number; onClick?: () => void }) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      onClick={onClick}
      className={cn(
        "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
        active ? "bg-brand-600/15 text-brand-400" : "text-slate-300 hover:bg-ink-800",
      )}
    >
      <Icon className="h-4 w-4 shrink-0" />
      <span className="flex-1">{item.label}</span>
      {!!badge && badge > 0 && <span className="rounded-full bg-brand-600 px-1.5 py-0.5 text-[10px] font-semibold text-white">{badge}</span>}
    </Link>
  );
}

function TabLink({ item, active, badge }: { item: (typeof NAV)[number]; active: boolean; badge?: number }) {
  const Icon = item.icon;
  return (
    <Link href={item.href} className={cn("relative flex flex-col items-center justify-center gap-0.5 py-2 text-[10px]", active ? "text-brand-400" : "text-slate-400")}>
      <Icon className="h-5 w-5" />
      {item.short}
      {!!badge && badge > 0 && <span className="absolute right-1/2 top-1 translate-x-3 rounded-full bg-warn px-1 text-[9px] font-semibold text-ink-950">{badge}</span>}
    </Link>
  );
}

function UserChip({ user }: { user: User }) {
  return (
    <div className="flex items-center gap-2">
      <span className="flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold text-white" style={{ backgroundColor: user.avatarColor }}>
        {user.name.split(" ").map((n) => n[0]).join("")}
      </span>
      <span className="hidden text-sm text-slate-300 sm:inline">{user.name.split(" ")[0]}</span>
    </div>
  );
}

function DataModePill({ dataMode, connectedCount, totalIntegrations, lastSyncAt }: { dataMode: "live" | "mock"; connectedCount: number; totalIntegrations: number; lastSyncAt: string | null }) {
  return (
    <Link href="/settings" className="block rounded-xl border border-ink-800 bg-ink-850 p-3 text-xs hover:border-ink-700">
      <div className="flex items-center gap-2">
        <span className={cn("h-2 w-2 rounded-full", dataMode === "live" ? "bg-ok" : "bg-warn")} />
        <span className="font-medium text-slate-200">{dataMode === "live" ? "Live data" : "Preview mode"}</span>
      </div>
      <p className="mt-1 text-slate-500">
        {connectedCount}/{totalIntegrations} integrations connected
      </p>
      {lastSyncAt && <p className="mt-0.5 text-slate-600">Synced {ago(lastSyncAt)}</p>}
    </Link>
  );
}
