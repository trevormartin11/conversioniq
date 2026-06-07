import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/**
 * Credit Guard was folded into Leads — credit visibility now lives where you actually spend
 * (sourcing the people). Solo operator, so the request→approve workflow was removed; this
 * route redirects to keep any existing links working.
 */
export default function CreditsPage() {
  redirect("/leads");
}
