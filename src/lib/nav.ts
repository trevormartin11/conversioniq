import {
  Coins,
  DollarSign,
  Inbox,
  LayoutDashboard,
  Megaphone,
  PenLine,
  Radar,
  Settings,
  ShieldCheck,
  Target,
  TrendingUp,
  Users,
  Workflow,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  short: string;
  icon: LucideIcon;
  phase: 1 | 2 | 3 | 4;
}

/**
 * Ordered to mirror the operating workflow so the nav reads like the process:
 * Command (measure) → Strategy → Source → Leads → Copy → Send → Deliverability
 * → Replies → Pipeline → Costs → Credits → Automation → Settings.
 */
export const NAV: NavItem[] = [
  { href: "/", label: "Command Center", short: "Command", icon: LayoutDashboard, phase: 1 },
  { href: "/strategy", label: "Strategy", short: "Strategy", icon: Target, phase: 1 },
  { href: "/source", label: "Source", short: "Source", icon: Radar, phase: 1 },
  { href: "/leads", label: "Leads & Suppression", short: "Leads", icon: Users, phase: 1 },
  { href: "/copy", label: "Copy Coach", short: "Copy", icon: PenLine, phase: 2 },
  { href: "/campaigns", label: "Campaigns", short: "Send", icon: Megaphone, phase: 2 },
  { href: "/deliverability", label: "Deliverability", short: "Health", icon: ShieldCheck, phase: 2 },
  { href: "/replies", label: "Reply Approval", short: "Replies", icon: Inbox, phase: 1 },
  { href: "/pipeline", label: "Pipeline & Residual", short: "Pipeline", icon: TrendingUp, phase: 3 },
  { href: "/costs", label: "Costs & P&L", short: "Costs", icon: DollarSign, phase: 1 },
  { href: "/credits", label: "Credit Guard", short: "Credits", icon: Coins, phase: 1 },
  { href: "/automation", label: "Automation", short: "Jobs", icon: Workflow, phase: 4 },
  { href: "/settings", label: "Settings", short: "Settings", icon: Settings, phase: 1 },
];

/** The 4 destinations in the mobile bottom tab bar (the daily-driver set).
 *  Mobile is used mainly to watch the numbers and approve replies, so Command +
 *  Replies lead; Pipeline (demo progress vs the 2/day goal) and Deliverability
 *  (inbox health) round it out. Everything else is one tap away in the drawer. */
export const PRIMARY_HREFS = ["/", "/replies", "/pipeline", "/deliverability"];
