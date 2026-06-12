import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** Merge Tailwind class names safely (conditional + de-duped). */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Stable id generator for seed/mock records and client-side optimistic rows.
 *  Crypto-seeded: Math.random ids collided often enough at scale (~6% at 100k) that an
 *  id-keyed upsert could silently merge two unrelated rows. */
export function uid(prefix = "id"): string {
  return `${prefix}_${crypto.randomUUID().slice(0, 13)}`;
}

/** Clamp a number into [min, max]. */
export function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

/** Convert email HTML to readable plain text (for sequence bodies / replies). */
export function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(div|p|li|tr)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&rsquo;|&#8217;/gi, "’")
    .replace(/&ldquo;|&rdquo;|&#8220;|&#8221;/gi, '"')
    .replace(/&mdash;|&#8212;/gi, "—")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
