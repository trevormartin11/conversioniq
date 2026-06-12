/**
 * Canonical email extraction + validation, shared by the paste-list parser and the
 * load-time suppression gate so they compare apples to apples. The suppression key is
 * the normalized address (`trim().toLowerCase()`); a pasted token in the universal
 * "Name <addr>" clipboard format (or dotted/quoted) must reduce to that same key, or a
 * DNC/contacted address slips past the gate.
 */

/** Pull the address out of a raw token: `"Name <a@b.com>"`, `<a@b.com>`, `a@b.com.`, `"a@b.com"`. */
export function extractEmail(token: string): string | null {
  if (!token) return null;
  let s = token.trim();
  // Prefer the address inside angle brackets ("Display Name <addr>").
  const angled = s.match(/<([^<>]+)>/);
  if (angled) s = angled[1].trim();
  // Strip wrapping quotes and trailing sentence punctuation.
  s = s.replace(/^["'<(]+/, "").replace(/["'>).,;:]+$/, "").trim();
  const normalized = s.toLowerCase();
  return isLikelyEmail(normalized) ? normalized : null;
}

/** A token is a plausible address: exactly one `@`, a dot in the domain, no whitespace. */
export function isLikelyEmail(value: string): boolean {
  if (!value || /\s/.test(value)) return false;
  const at = value.indexOf("@");
  if (at <= 0 || at !== value.lastIndexOf("@")) return false;
  const domain = value.slice(at + 1);
  return domain.includes(".") && !domain.startsWith(".") && !domain.endsWith(".");
}
