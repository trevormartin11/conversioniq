/** Sync Instantly campaign analytics into daily_metrics (today's snapshot per campaign). */
import { getCampaignAnalytics } from "@/lib/integrations/instantly";
import { chunkedUpsert } from "@/lib/data/supabase";

const n = (v: unknown) => (typeof v === "number" ? v : Number(v) || 0);

export async function syncMetrics() {
  const analytics = await getCampaignAnalytics();
  if (!analytics.length) return { metrics: 0 };
  const today = new Date().toISOString().slice(0, 10);
  const rows = analytics
    .filter((a) => a.campaign_id)
    .map((a) => ({
      date: today,
      campaign_id: `c_${a.campaign_id}`,
      sends: n(a.emails_sent_count ?? a.contacted ?? a.sent),
      opens: n(a.open_count ?? a.opened),
      replies: n(a.reply_count ?? a.replied),
      positives: n(a.positive_reply_count),
      bounces: n(a.bounced_count ?? a.bounced),
      demos: 0,
    }));
  const written = rows.length ? await chunkedUpsert("daily_metrics", rows, "date,campaign_id") : 0;
  return { metrics: written };
}
