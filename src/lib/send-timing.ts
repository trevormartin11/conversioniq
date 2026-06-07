/**
 * Send timing — fire each cold email in the recipient's optimal LOCAL window.
 *
 * We don't have a precise location per lead, so timezone is inferred from the phone
 * area code (the most reliable signal we have today). The window is a conservative
 * B2B best-practice default the operator can refine. True per-recipient scheduling
 * maps to timezone-bucketed Instantly sub-sends (Instantly schedules are per-campaign),
 * so we bucket leads by timezone here.
 */
import type { Lead } from "@/lib/data/types";

export type Tz = "ET" | "CT" | "MT" | "PT" | "unknown";

export const TZ_LABEL: Record<Tz, string> = {
  ET: "Eastern",
  CT: "Central",
  MT: "Mountain",
  PT: "Pacific",
  unknown: "Unknown",
};

// UTC offsets (standard time; close enough for windowing + ops display).
const TZ_UTC_OFFSET: Record<Exclude<Tz, "unknown">, number> = { ET: -5, CT: -6, MT: -7, PT: -8 };

// Major North American area codes → timezone. Not exhaustive; unknowns fall back to "unknown".
const AREA_CODE_TZ: Record<string, Exclude<Tz, "unknown">> = {
  "212": "ET", "646": "ET", "332": "ET", "917": "ET", "718": "ET", "347": "ET", "929": "ET", "202": "ET", "305": "ET", "786": "ET", "404": "ET", "470": "ET", "678": "ET", "617": "ET", "857": "ET", "215": "ET", "267": "ET", "412": "ET", "216": "ET", "614": "ET", "313": "ET", "954": "ET", "561": "ET", "813": "ET", "407": "ET", "704": "ET", "980": "ET", "919": "ET", "984": "ET", "804": "ET", "757": "ET", "716": "ET", "585": "ET", "315": "ET",
  "312": "CT", "773": "CT", "872": "CT", "630": "CT", "847": "CT", "214": "CT", "469": "CT", "972": "CT", "713": "CT", "281": "CT", "832": "CT", "210": "CT", "512": "CT", "737": "CT", "817": "CT", "615": "CT", "629": "CT", "901": "CT", "504": "CT", "314": "CT", "816": "CT", "612": "CT", "763": "CT", "952": "CT", "414": "CT", "608": "CT", "405": "CT", "918": "CT", "402": "CT", "316": "CT", "225": "CT", "205": "CT",
  "303": "MT", "720": "MT", "970": "MT", "719": "MT", "801": "MT", "385": "MT", "602": "MT", "480": "MT", "623": "MT", "505": "MT", "406": "MT", "208": "MT", "307": "MT",
  "213": "PT", "323": "PT", "310": "PT", "424": "PT", "818": "PT", "747": "PT", "626": "PT", "661": "PT", "562": "PT", "714": "PT", "949": "PT", "415": "PT", "628": "PT", "510": "PT", "408": "PT", "669": "PT", "650": "PT", "916": "PT", "925": "PT", "619": "PT", "858": "PT", "760": "PT", "206": "PT", "253": "PT", "425": "PT", "503": "PT", "971": "PT", "702": "PT", "725": "PT",
};

/** Infer the recipient's timezone from their phone area code. */
export function leadTimezone(lead: Pick<Lead, "phone">): Tz {
  const digits = (lead.phone ?? "").replace(/\D/g, "");
  const local = digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
  if (local.length < 10) return "unknown";
  return AREA_CODE_TZ[local.slice(0, 3)] ?? "unknown";
}

/** Best-practice cold-email window in the recipient's local time. Conservative + B2B-friendly. */
export const OPTIMAL_WINDOW = { label: "Tue–Thu · 8:00–9:30am local", startHour: 8, endHour: 9, endMinute: 30 } as const;

const pad = (n: number) => String(n).padStart(2, "0");

/** Translate the local optimal window to the server's UTC time, for ops visibility. */
export function serverWindowFor(tz: Exclude<Tz, "unknown">): string {
  const off = TZ_UTC_OFFSET[tz];
  const toUtc = (h: number) => (((h - off) % 24) + 24) % 24;
  return `${pad(toUtc(OPTIMAL_WINDOW.startHour))}:00–${pad(toUtc(OPTIMAL_WINDOW.endHour))}:${pad(OPTIMAL_WINDOW.endMinute)} UTC`;
}

/**
 * Instantly's schedule timezone is a restricted enum (verified live against the API):
 * New_York / Denver / Los_Angeles are rejected — these are the accepted zones per US
 * timezone. Instantly has no Pacific (UTC-8) entry, so PT maps to Boise (~1h early).
 */
export const INSTANTLY_TZ: Record<Exclude<Tz, "unknown">, string> = {
  ET: "America/Detroit",
  CT: "America/Chicago",
  MT: "America/Boise",
  PT: "America/Boise",
};

/** The optimal window as HH:MM strings for an Instantly campaign schedule. */
export function optimalWindowHHMM(): { from: string; to: string } {
  return { from: `${pad(OPTIMAL_WINDOW.startHour)}:00`, to: `${pad(OPTIMAL_WINDOW.endHour)}:${pad(OPTIMAL_WINDOW.endMinute)}` };
}

export interface TzBucket {
  tz: Tz;
  label: string;
  count: number;
  localWindow: string;
  serverWindow: string | null;
}

/** Group leads by inferred timezone (ET→CT→MT→PT→unknown), with the window each should send in. */
export function bucketByTimezone(leads: Pick<Lead, "phone">[]): TzBucket[] {
  const counts = new Map<Tz, number>();
  for (const l of leads) {
    const tz = leadTimezone(l);
    counts.set(tz, (counts.get(tz) ?? 0) + 1);
  }
  const order: Tz[] = ["ET", "CT", "MT", "PT", "unknown"];
  return order
    .filter((tz) => (counts.get(tz) ?? 0) > 0)
    .map((tz) => ({
      tz,
      label: TZ_LABEL[tz],
      count: counts.get(tz) ?? 0,
      localWindow: tz === "unknown" ? "defaults to the Eastern window" : OPTIMAL_WINDOW.label,
      serverWindow: tz === "unknown" ? null : serverWindowFor(tz as Exclude<Tz, "unknown">),
    }));
}
