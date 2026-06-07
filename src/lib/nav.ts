import {
  DollarSign,
  Inbox,
  LayoutDashboard,
  Lightbulb,
  Megaphone,
  Radar,
  Rocket,
  Settings,
  ShieldCheck,
  Target,
  TrendingUp,
  Users,
  Workflow,
  type LucideIcon,
} from "lucide-react";

export type NavGroup = "" | "build" | "run" | "measure" | "system";

export interface NavItem {
  href: string;
  label: string;
  short: string;
  icon: LucideIcon;
  phase: 1 | 2 | 3 | 4;
  group: NavGroup;
}

/** Sidebar section headers, so the nav reads like the operating process. */
export const NAV_GROUPS: { id: Exclude<NavGroup, "">; label: string }[] = [
  { id: "build", label: "Build a campaign" },
  { id: "run", label: "Run" },
  { id: "measure", label: "Measure" },
  { id: "system", label: "System" },
];

/**
 * Grouped to mirror the outbound workflow:
 *   Build a campaign:  Launch (guided) → Strategy (vertical+problem) → Source (people)
 *                      → Leads → Copy & Sequence → Campaigns (send)
 *   Run:               Replies · Deliverability
 *   Measure:           Pipeline · Costs · Credits
 *   System:            Automation · Settings
 */
export const NAV: NavItem[] = [
  { href: "/", label: "Command Center", short: "Command", icon: LayoutDashboard, phase: 1, group: "" },
  // Build a campaign — the outbound flow, in order
  { href: "/launch", label: "Launch Campaign", short: "Launch", icon: Rocket, phase: 1, group: "build" },
  { href: "/strategy", label: "Strategy", short: "Strategy", icon: Target, phase: 1, group: "build" },
  { href: "/source", label: "Source", short: "Source", icon: Radar, phase: 1, group: "build" },
  { href: "/leads", label: "Leads & Suppression", short: "Leads", icon: Users, phase: 1, group: "build" },
  { href: "/campaigns", label: "Campaigns", short: "Send", icon: Megaphone, phase: 2, group: "build" },
  // Run the machine
  { href: "/replies", label: "Reply Approval", short: "Replies", icon: Inbox, phase: 1, group: "run" },
  { href: "/deliverability", label: "Deliverability", short: "Health", icon: ShieldCheck, phase: 2, group: "run" },
  // Measure
  { href: "/analysis", label: "Analysis", short: "Analysis", icon: Lightbulb, phase: 3, group: "measure" },
  { href: "/pipeline", label: "Pipeline & Residual", short: "Pipeline", icon: TrendingUp, phase: 3, group: "measure" },
  { href: "/costs", label: "Costs & P&L", short: "Costs", icon: DollarSign, phase: 1, group: "measure" },
  // System
  { href: "/automation", label: "Automation", short: "Jobs", icon: Workflow, phase: 4, group: "system" },
  { href: "/settings", label: "Settings", short: "Settings", icon: Settings, phase: 1, group: "system" },
];

/** The 4 destinations in the mobile bottom tab bar (the daily-driver set).
 *  Mobile is used mainly to watch the numbers and approve replies, so Command +
 *  Replies lead; Pipeline (demo progress vs the 2/day goal) and Deliverability
 *  (inbox health) round it out. Everything else is one tap away in the drawer. */
export const PRIMARY_HREFS = ["/", "/replies", "/pipeline", "/deliverability"];
