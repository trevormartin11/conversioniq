import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { LandingTemplate } from "@/components/landing/landing-template";
import { LandingControls } from "@/components/landing/landing-controls";
import { ensureData, getCampaign, getLandingPage } from "@/lib/data/store";

export const dynamic = "force-dynamic";

export default async function CampaignLandingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await ensureData();
  const campaign = getCampaign(id);
  if (!campaign) notFound();
  const page = getLandingPage(id);

  return (
    <div className="space-y-4">
      <Link href={`/campaigns/${id}`} className="inline-flex items-center gap-1.5 text-sm text-slate-400 transition-colors hover:text-slate-200">
        <ArrowLeft className="h-4 w-4" /> Back to {campaign.name}
      </Link>

      <LandingControls campaignId={id} status={page?.status ?? null} source={page?.source ?? null} hasPage={!!page} />

      {page ? (
        <div className="overflow-hidden rounded-xl border border-ink-700">
          {/* Live preview of the generated microsite (renders exactly what publishes in Phase 2). */}
          <LandingTemplate content={page.content} schedulerUrl={page.schedulerUrl} videoUrl={page.videoUrl} />
        </div>
      ) : (
        <div className="rounded-xl border border-ink-700 bg-ink-900/40 p-10 text-center text-sm text-slate-400">
          No landing page yet for <span className="text-slate-200">{campaign.name}</span>. Click <span className="font-medium text-brand-300">Generate</span> above to draft one from this campaign&apos;s vertical and copy.
        </div>
      )}
    </div>
  );
}
