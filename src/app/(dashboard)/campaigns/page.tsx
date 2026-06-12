import Link from "next/link";
import { Plus, Rocket } from "lucide-react";
import { Empty, PageHeader, SectionHeader } from "@/components/ui/card";
import { CampaignBoardCard } from "@/components/campaigns/campaign-board-card";
import { campaignBoard } from "@/lib/data/queries";
import { ensureData } from "@/lib/data/store";

export const dynamic = "force-dynamic";

// Board groups in operator priority order — Active first, then what's queued, then the rest.
const GROUPS: { key: string; label: string; sub: string }[] = [
  { key: "active", label: "Active", sub: "Sending now" },
  { key: "draft", label: "Staged", sub: "Built — launch once inboxes are warm" },
  { key: "paused", label: "Paused", sub: "Held — review before resuming" },
  { key: "completed", label: "Completed", sub: "Wrapped up" },
];

export default async function CampaignsPage() {
  await ensureData(["campaigns", "variants", "leads", "demos", "replies", "inboxes", "metrics", "landingPages"]);
  const board = campaignBoard();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Campaigns"
        subtitle="Parallel cells by vertical — leads, funnel, pipeline & sending health at a glance."
        action={
          <Link
            href="/launch"
            className="inline-flex h-10 items-center justify-center gap-1.5 rounded-lg bg-brand-gradient px-4 text-sm font-medium text-white shadow-[0_1px_0_rgba(255,255,255,0.18)_inset,0_8px_20px_-8px_rgba(124,108,255,0.65)] transition-all hover:brightness-110"
          >
            <Plus className="h-4 w-4" /> New campaign
          </Link>
        }
      />

      {board.length === 0 ? (
        <Empty icon={Rocket} title="No campaigns yet">
          Build your first sequence in the launch wizard — pick a vertical, draft the touches, and save it as a draft.
        </Empty>
      ) : (
        GROUPS.map((g) => {
          const cards = board.filter((c) => c.status === g.key);
          if (cards.length === 0) return null;
          return (
            <section key={g.key}>
              <SectionHeader title={`${g.label} · ${cards.length}`} subtitle={g.sub} />
              <div className="space-y-3">
                {cards.map((c) => (
                  <CampaignBoardCard key={c.id} c={c} />
                ))}
              </div>
            </section>
          );
        })
      )}
    </div>
  );
}
