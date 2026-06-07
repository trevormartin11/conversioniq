import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/**
 * "Copy Coach" was folded into the flow rather than kept as its own section: per-campaign
 * copy + sequence editing lives on the campaign page, cross-campaign learnings + next moves
 * live in Analysis, and campaign creation is the Launch wizard. This route redirects so any
 * existing links keep working.
 */
export default function CopyPage() {
  redirect("/campaigns");
}
