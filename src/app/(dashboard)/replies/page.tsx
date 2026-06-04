import { ReplyQueue, type ReplyView } from "@/components/replies/reply-queue";
import { ensureData, getAutomationLevel, getLead, getReplies } from "@/lib/data/store";
import { integrations } from "@/lib/config";

export const dynamic = "force-dynamic";

export default async function RepliesPage() {
  await ensureData();
  const replies: ReplyView[] = getReplies()
    .slice()
    .sort((a, b) => {
      // pending first, then hot, then most recent
      if ((a.status === "pending") !== (b.status === "pending")) return a.status === "pending" ? -1 : 1;
      if (a.hot !== b.hot) return a.hot ? -1 : 1;
      return b.receivedAt.localeCompare(a.receivedAt);
    })
    .map((r) => {
      const lead = getLead(r.leadId);
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
      <div>
        <h1 className="text-xl font-semibold text-slate-100">Reply Approval</h1>
        <p className="text-sm text-slate-500">Every reply across all inboxes, AI-sorted with a drafted response. Approve, edit, or send.</p>
      </div>
      <ReplyQueue replies={replies} automationLevel={getAutomationLevel()} aiAvailable={integrations.anthropic} />
    </div>
  );
}
