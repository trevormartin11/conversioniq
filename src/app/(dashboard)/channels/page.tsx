import { PageHeader } from "@/components/ui/card";
import { Tag } from "@/components/ui/badge";
import { ChannelsBoard } from "@/components/channels/channels-board";
import { ensureData, getChannelAccounts, getConsent, getLeads, getOutreach } from "@/lib/data/store";
import { integrations } from "@/lib/config";

export const dynamic = "force-dynamic";

export default async function ChannelsPage() {
  await ensureData(["channelAccounts", "consent", "leads", "outreach"]);
  const accounts = getChannelAccounts();
  const consent = getConsent();
  const outreach = getOutreach();
  // A pool of already-engaged leads to draft warm outreach to (SMS needs consent; social is human-sent).
  const leads = getLeads()
    .filter((l) => ["replied", "positive", "opened", "contacted"].includes(l.status))
    .slice(0, 50)
    .map((l) => ({ id: l.id, name: `${l.firstName} ${l.lastName}`, company: l.company, title: l.title, vertical: l.vertical, phone: l.phone, status: l.status }));

  return (
    <div className="space-y-6">
      <PageHeader
        title="SMS & Social DMs"
        subtitle="The high-yield warm layer: consent-gated SMS and AI-drafted, human-sent social DMs. Compliance is enforced in the product, not left to memory."
        action={<Tag tone={integrations.twilio ? "ok" : "slate"}>{integrations.twilio ? "Twilio live" : "Twilio not connected — sends simulate"}</Tag>}
      />
      <ChannelsBoard
        accounts={accounts}
        consent={consent}
        outreach={outreach}
        leads={leads}
        aiOn={integrations.anthropic}
        twilioOn={integrations.twilio}
      />
    </div>
  );
}
