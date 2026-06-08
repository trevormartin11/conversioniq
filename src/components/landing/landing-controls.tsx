"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, Wand2 } from "lucide-react";
import { Card, CardBody } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tag } from "@/components/ui/badge";
import { toast } from "@/components/ui/toast";
import { approveLandingPageAction, generateLandingPageAction } from "@/app/(dashboard)/campaigns/landing-actions";
import type { LandingStatus } from "@/lib/data/types";

const STATUS_TONE: Record<LandingStatus, "slate" | "brand" | "ok"> = { draft: "slate", approved: "ok", published: "brand" };

export function LandingControls({
  campaignId,
  status,
  source,
  hasPage,
}: {
  campaignId: string;
  status: LandingStatus | null;
  source: "ai" | "rules" | null;
  hasPage: boolean;
}) {
  const router = useRouter();
  const [busy, start] = useTransition();

  function generate() {
    start(async () => {
      const r = await generateLandingPageAction(campaignId);
      if (!r.ok) return toast.error(r.error);
      toast.success(r.source === "ai" ? "Page drafted" : "Page drafted (template — connect Claude for AI copy)");
      router.refresh();
    });
  }
  function approve() {
    start(async () => {
      const r = await approveLandingPageAction(campaignId);
      if (!r.ok) return toast.error(r.error);
      toast.success("Landing page approved — ready to publish");
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
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant={hasPage ? "ghost" : "primary"} disabled={busy} onClick={generate}>
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wand2 className="h-3.5 w-3.5" />} {hasPage ? "Regenerate" : "Generate"}
          </Button>
          {hasPage && status !== "approved" && status !== "published" && (
            <Button size="sm" variant="primary" disabled={busy} onClick={approve}>
              <Check className="h-3.5 w-3.5" /> Approve
            </Button>
          )}
        </div>
      </CardBody>
    </Card>
  );
}
