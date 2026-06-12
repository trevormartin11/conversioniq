import { ReplyQueue, type ReplyView } from "@/components/replies/reply-queue";
import { PageHeader } from "@/components/ui/card";
import { ensureData, getAutomationLevel, getLeads, getReplies } from "@/lib/data/store";
import { integrations } from "@/lib/config";

export const dynamic = "force-dynamic";

/** Every pending reply always ships; handled history is capped — the page used to serialize
 *  the ENTIRE replies table (bodies + drafts, twice: SSR + RSC payload) — 30 MB at 5k replies. */
const HANDLED_HISTORY_CAP = 200;

export default async function RepliesPage() {
  await ensureData(["replies", "leads"]);
  const leadById = new Map(getLeads().map((l) => [l.id, l]));
  const sorted = getReplies()
    .slice()
    .sort((a, b) => {
      // pending first, then hot, then most recent
      if ((a.status === "pending") !== (b.status === "pending")) return a.status === "pending" ? -1 : 1;
      if (a.hot !== b.hot) return a.hot ? -1 : 1;
      return b.receivedAt.localeCompare(a.receivedAt);
    });
  const pending = sorted.filter((r) => r.status === "pending");
  const handled = sorted.filter((r) => r.status !== "pending").slice(0, HANDLED_HISTORY_CAP);
  const replies: ReplyView[] = [...pending, ...handled]
    .map((r) => {
      const lead = leadById.get(r.leadId);
      return {
        id: r.id,
        leadId: r.leadId,
        fromName: r.fromName,
        fromEmail: r.fromEmail,
        subject: r.subject,
        body: r.body,
        receivedAt: r.receivedAt,
        classification: r.classification,
        confidence: r.confidence,
        aiDraft: r.aiDraft,
        draftSource: r.draftSource,
        status: r.status,
        hot: r.hot,
        company: lead?.company ?? "—",
        vertical: lead?.vertical ?? "—",
      };
    });

  return (
    <div className="space-y-5">
      <PageHeader title="Reply Approval" subtitle="Every reply across all inboxes, AI-sorted with a drafted response. Approve, edit, or send." />
      <ReplyQueue replies={replies} automationLevel={getAutomationLevel()} aiAvailable={integrations.anthropic} />
    </div>
  );
}
