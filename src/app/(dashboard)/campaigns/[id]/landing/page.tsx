import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { LandingWorkbench } from "@/components/landing/landing-workbench";
import { LandingControls } from "@/components/landing/landing-controls";
import { ensureData, getCampaign, getDomains, getInboxes, getLandingPage } from "@/lib/data/store";
import { publishHostFor } from "@/lib/landing/publish";

export const dynamic = "force-dynamic";

export default async function CampaignLandingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await ensureData(["campaigns", "domains", "inboxes", "landingPages"]);
  const campaign = getCampaign(id);
  if (!campaign) notFound();
  const page = getLandingPage(id);

  // Where Publish will put it: the configured domain, else the campaign's first sending domain.
  const firstInbox = getInboxes().find((i) => campaign.inboxIds.includes(i.id));
  const autoDomain = getDomains().find((d) => d.id === firstInbox?.domainId)?.domain ?? firstInbox?.email.split("@")[1] ?? null;
  const targetDomain = page?.domain ?? autoDomain;
  const publishTarget = targetDomain ? publishHostFor(targetDomain) : null;

  return (
    <div className="space-y-4">
      <Link href={`/campaigns/${id}`} className="inline-flex items-center gap-1.5 text-sm text-slate-400 transition-colors hover:text-slate-200">
        <ArrowLeft className="h-4 w-4" /> Back to {campaign.name}
      </Link>

      <LandingControls
        campaignId={id}
        status={page?.status ?? null}
        source={page?.source ?? null}
        hasPage={!!page}
        publishTarget={publishTarget}
        publishedUrl={page?.publishedUrl ?? null}
      />

      {page ? (
        <LandingWorkbench campaignId={id} content={page.content} status={page.status} schedulerUrl={page.schedulerUrl} videoUrl={page.videoUrl} />
      ) : (
        <div className="rounded-xl border border-ink-700 bg-ink-900/40 p-10 text-center text-sm text-slate-400">
          No landing page yet for <span className="text-slate-200">{campaign.name}</span>. Click <span className="font-medium text-brand-300">Generate</span> above to draft one from this campaign&apos;s vertical and copy.
        </div>
      )}
    </div>
  );
}
