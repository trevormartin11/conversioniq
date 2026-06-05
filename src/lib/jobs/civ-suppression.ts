/**
 * Pull ConversionIQ's existing customers/accounts into our suppression universe so we
 * never pitch someone already in their funnel. Domain-level, so the whole company is
 * covered (isSuppressed matches on domain). No-op until CIQ's Zoho org is configured.
 */
import { listCivAccounts } from "@/lib/integrations/zoho-civ";
import { addSuppression, isSuppressed } from "@/lib/data/store";

/** Extract a bare registrable host from a website string (various formats). */
export function domainFromWebsite(site: string | undefined | null): string | null {
  if (!site || typeof site !== "string") return null;
  try {
    const url = site.includes("://") ? site : `https://${site.trim()}`;
    const host = new URL(url).hostname.toLowerCase().replace(/^www\./, "");
    return host.includes(".") ? host : null;
  } catch {
    return null;
  }
}

export async function syncCivCustomers(actor = "system"): Promise<{ scanned: number; suppressed: number }> {
  const accounts = (await listCivAccounts()) as Record<string, unknown>[];
  let suppressed = 0;
  for (const a of accounts) {
    const website = typeof a.Website === "string" ? a.Website : undefined;
    const email = typeof a.Email === "string" ? a.Email : "";
    const domain = domainFromWebsite(website) ?? (email.includes("@") ? email.split("@")[1].toLowerCase() : null);
    if (!domain) continue;
    if (isSuppressed(`_@${domain}`).suppressed) continue; // already covered
    const name = typeof a.Account_Name === "string" ? a.Account_Name : domain;
    await addSuppression(
      { email: null, domain, reason: "civ_customer", source: "zoho-civ", leadId: null, note: `ConversionIQ customer: ${name}` },
      actor,
    );
    suppressed++;
  }
  return { scanned: accounts.length, suppressed };
}
