import {
  Coins,
  DollarSign,
  Inbox,
  LayoutDashboard,
  Megaphone,
  PenLine,
  Settings,
  ShieldCheck,
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

export const NAV: NavItem[] = [
  { href: "/", label: "Command Center", short: "Command", icon: LayoutDashboard, phase: 1 },
  { href: "/replies", label: "Reply Approval", short: "Replies", icon: Inbox, phase: 1 },
  { href: "/leads", label: "Leads & Suppression", short: "Leads", icon: Users, phase: 1 },
  { href: "/credits", label: "Credit Guard", short: "Credits", icon: Coins, phase: 1 },
  { href: "/deliverability", label: "Deliverability", short: "Health", icon: ShieldCheck, phase: 2 },
  { href: "/campaigns", label: "Campaigns", short: "Campaigns", icon: Megaphone, phase: 2 },
  { href: "/copy", label: "Copy Coach", short: "Copy", icon: PenLine, phase: 2 },
  { href: "/pipeline", label: "Pipeline & Residual", short: "Pipeline", icon: TrendingUp, phase: 3 },
  { href: "/costs", label: "Costs & P&L", short: "Costs", icon: DollarSign, phase: 1 },
  { href: "/automation", label: "Automation", short: "Jobs", icon: Workflow, phase: 4 },
  { href: "/settings", label: "Settings", short: "Settings", icon: Settings, phase: 1 },
];

/** Destinations shown in the mobile bottom tab bar (the daily-driver set). */
export const PRIMARY_HREFS = ["/", "/replies", "/leads", "/credits"];
