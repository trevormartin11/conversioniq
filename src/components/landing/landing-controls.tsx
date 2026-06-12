"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, ExternalLink, Globe, Loader2, Wand2 } from "lucide-react";
import { Card, CardBody } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tag } from "@/components/ui/badge";
import { toast } from "@/components/ui/toast";
import { approveLandingPageAction, generateLandingPageAction, publishLandingPageAction } from "@/app/(dashboard)/campaigns/landing-actions";
import type { LandingStatus } from "@/lib/data/types";

const STATUS_TONE: Record<LandingStatus, "slate" | "brand" | "ok"> = { draft: "slate", approved: "ok", published: "brand" };

export function LandingControls({
  campaignId,
  status,
  source,
  hasPage,
  publishTarget,
  publishedUrl,
}: {
  campaignId: string;
  status: LandingStatus | null;
  source: "ai" | "rules" | null;
  hasPage: boolean;
  /** Where Publish will put it (go.<domain>) — shown before the click so there's no surprise. */
  publishTarget?: string | null;
  publishedUrl?: string | null;
}) {
  const router = useRouter();
  const [busy, start] = useTransition();

  function generate() {
    start(async () => {
      try {
        const r = await generateLandingPageAction(campaignId);
        if (!r.ok) return toast.error(r.error);
        toast.success(r.source === "ai" ? "Page drafted" : "Page drafted (template — connect Claude for AI copy)");
      } catch {
        toast.error("That didn't go through — try again.");
      }
      router.refresh();
    });
  }
  function approve() {
    start(async () => {
      try {
        const r = await approveLandingPageAction(campaignId);
        if (!r.ok) return toast.error(r.error);
        toast.success("Landing page approved — ready to publish");
      } catch {
        toast.error("That didn't go through — try again.");
      }
      router.refresh();
    });
  }
  function publish() {
    start(async () => {
      try {
        const r = await publishLandingPageAction(campaignId);
        if (!r.ok) return toast.error(r.error);
        toast.success(`Live at ${r.url} (DNS can take a few minutes)`, { label: "Open →", onClick: () => window.open(r.url, "_blank") });
      } catch {
        toast.error("Publish didn't go through — try again.");
      }
      router.refresh();
    });
  }

  return (
    <Card>
      <CardBody className="flex flex-wrap items-center justify-between gap-3 py-3">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-slate-100">Landing page</span>
          {status && <Tag tone={STATUS_TONE[status]}>{status}</Tag>}
          {hasPage && source && <span className="text-[11px] text-slate-500">{source === "ai" ? "AI copy" : "template copy"}</span>}
          {status === "published" && publishedUrl && (
            <a href={publishedUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[11px] font-medium text-brand-400 hover:text-brand-300">
              {publishedUrl.replace(/^https?:\/\//, "")} <ExternalLink className="h-3 w-3" />
            </a>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant={hasPage ? "ghost" : "primary"} disabled={busy} onClick={generate}>
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wand2 className="h-3.5 w-3.5" />} {hasPage ? "Regenerate" : "Generate"}
          </Button>
          {hasPage && status === "draft" && (
            <Button size="sm" variant="primary" disabled={busy} onClick={approve}>
              <Check className="h-3.5 w-3.5" /> Approve
            </Button>
          )}
          {hasPage && status === "approved" && (
            <Button size="sm" variant="primary" disabled={busy} onClick={publish}>
              <Globe className="h-3.5 w-3.5" /> Publish{publishTarget ? ` to ${publishTarget}` : ""}
            </Button>
          )}
          {hasPage && status === "published" && (
            <Button size="sm" variant="ghost" disabled={busy} onClick={publish} title="Re-run domain + DNS attach and refresh the published URL">
              <Globe className="h-3.5 w-3.5" /> Republish
            </Button>
          )}
        </div>
      </CardBody>
    </Card>
  );
}
