import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/**
 * Source folded into Leads — the lead book, sourcing planner, cost ceiling and credit
 * visibility now live in one "find the people" stage. This route redirects so old links work.
 */
export default function SourcePage() {
  redirect("/leads");
}
