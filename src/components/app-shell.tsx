"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X, Radio } from "lucide-react";
import { NAV, NAV_GROUPS, PRIMARY_HREFS } from "@/lib/nav";
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
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-white/[0.06] bg-ink-900/40 px-3 py-4 backdrop-blur-xl md:flex">
        <Brand />
        <nav className="mt-6 flex flex-1 flex-col gap-1 overflow-y-auto">
          <NavSections pathname={pathname} queueCount={queueCount} />
        </nav>
        <DataModePill dataMode={dataMode} connectedCount={connectedCount} totalIntegrations={totalIntegrations} lastSyncAt={lastSyncAt} />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Top bar */}
        <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b border-white/[0.06] bg-ink-950/70 px-3 backdrop-blur-xl md:px-6">
          <button className="rounded-lg p-2 text-slate-300 hover:bg-ink-800 md:hidden" onClick={() => setDrawer(true)} aria-label="Open menu">
            <Menu className="h-5 w-5" />
          </button>
          <div className="md:hidden"><Brand compact /></div>
          <div className="ml-auto flex items-center gap-3">
            <form action="/leads" className="hidden lg:block">
              <input
                name="q"
                placeholder="Search leads…"
                aria-label="Search leads"
                className="h-8 w-44 rounded-lg border border-white/10 bg-white/[0.03] px-3 text-xs text-slate-200 transition-all placeholder:text-slate-500 focus:w-60 focus:border-brand-500 focus:bg-ink-900 focus:outline-none"
              />
            </form>
            <span className="hidden items-center gap-1.5 rounded-full bg-white/5 px-2.5 py-1 text-xs text-slate-300 sm:inline-flex">
              <span className={cn("h-1.5 w-1.5 rounded-full", dataMode === "live" ? "bg-ok" : "bg-warn")} />
              {dataMode === "live" ? "Live" : "Preview"}
            </span>
            <UserChip user={user} />
          </div>
        </header>

        {dataMode === "mock" && (
          <div role="status" className="border-b border-warn/20 bg-warn/10 px-3 py-2 text-center text-xs text-amber-200 md:px-6">
            Sample data — every number here is seeded preview data, not your real pipeline.{" "}
            <Link href="/settings" className="font-medium underline underline-offset-2 hover:text-amber-100">Connect Supabase in Settings</Link> to go live.
          </div>
        )}
        <main className="mx-auto w-full max-w-5xl flex-1 px-3 pb-28 pt-4 md:px-6 md:pb-10">{children}</main>
      </div>

      {/* Mobile bottom tabs */}
      <nav className="fixed inset-x-0 bottom-0 z-20 grid grid-cols-5 border-t border-white/[0.06] bg-ink-950/85 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl md:hidden">
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
          <div className="absolute left-0 top-0 h-full w-72 border-r border-white/10 bg-ink-900/95 p-4 shadow-2xl backdrop-blur-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <Brand />
              <button className="rounded-lg p-2 text-slate-400 hover:bg-ink-800" onClick={() => setDrawer(false)} aria-label="Close menu">
                <X className="h-5 w-5" />
              </button>
            </div>
            <nav className="mt-5 flex flex-col gap-1 overflow-y-auto pb-4" style={{ maxHeight: "calc(100vh - 7rem)" }}>
              <NavSections pathname={pathname} queueCount={queueCount} onNavigate={() => setDrawer(false)} />
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
    <Link href="/" className="flex items-center gap-2.5">
      <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-brand-gradient text-white shadow-[0_0_0_1px_rgba(124,108,255,0.4),0_6px_16px_-6px_rgba(124,108,255,0.7)]">
        <Radio className="h-4 w-4" />
      </span>
      {!compact && (
        <span className="text-[15px] font-semibold tracking-tight text-slate-100">
          CIQ <span className="text-slate-500">Hub</span>
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
        "group relative flex items-center gap-3 rounded-xl px-3 py-2 text-sm transition-all",
        active
          ? "bg-gradient-to-r from-brand-600/20 to-brand-600/[0.04] text-white ring-1 ring-inset ring-brand-500/20"
          : "text-slate-400 hover:bg-white/[0.04] hover:text-slate-100",
      )}
    >
      {active && <span className="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-full bg-brand-400" />}
      <Icon className={cn("h-4 w-4 shrink-0 transition-colors", active ? "text-brand-300" : "text-slate-500 group-hover:text-slate-300")} />
      <span className="flex-1">{item.label}</span>
      {!!badge && badge > 0 && <span className="rounded-full bg-brand-gradient px-1.5 py-0.5 text-[10px] font-semibold text-white shadow-[0_2px_8px_-2px_rgba(124,108,255,0.8)]">{badge}</span>}
    </Link>
  );
}

function NavSections({ pathname, queueCount, onNavigate }: { pathname: string; queueCount: number; onNavigate?: () => void }) {
  const badgeFor = (href: string) => (href === "/replies" ? queueCount : undefined);
  return (
    <>
      {NAV.filter((n) => n.group === "").map((item) => (
        <NavLink key={item.href} item={item} active={isActive(pathname, item.href)} badge={badgeFor(item.href)} onClick={onNavigate} />
      ))}
      {NAV_GROUPS.map((g) => (
        <div key={g.id} className="mt-3 flex flex-col gap-1">
          <p className="px-3 pb-0.5 text-[10px] font-semibold uppercase tracking-wider text-slate-600">{g.label}</p>
          {NAV.filter((n) => n.group === g.id).map((item) => (
            <NavLink key={item.href} item={item} active={isActive(pathname, item.href)} badge={badgeFor(item.href)} onClick={onNavigate} />
          ))}
        </div>
      ))}
    </>
  );
}

function TabLink({ item, active, badge }: { item: (typeof NAV)[number]; active: boolean; badge?: number }) {
  const Icon = item.icon;
  return (
    <Link href={item.href} className={cn("relative flex flex-col items-center justify-center gap-0.5 py-2 text-[10px] transition-colors", active ? "text-brand-300" : "text-slate-500")}>
      {active && <span className="absolute inset-x-5 top-0 h-0.5 rounded-full bg-brand-400" />}
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
    <Link href="/settings" className="block rounded-xl border border-white/[0.07] bg-white/[0.02] p-3 text-xs transition-colors hover:border-brand-500/30 hover:bg-white/[0.04]">
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
