/**
 * Demo reminder draft — the no-show defense. The hub composes it; the operator sends
 * with one click (control preserved while the cadence is being proven out).
 */
export interface ReminderInput {
  firstName: string;
  company: string;
  scheduledAt: string; // ISO
  demoOwner: string; // who runs it (Jon)
  senderName: string; // the operator sending it (Trevor)
}

export function buildDemoReminder(input: ReminderInput): { subject: string; body: string } {
  const when = new Date(input.scheduledAt);
  const valid = !Number.isNaN(when.getTime());
  const date = valid ? when.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" }) : "our upcoming call";
  const time = valid ? when.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }) : "";
  const first = input.firstName?.trim() || "there";
  const company = input.company?.trim() || "your team";

  const subject = `Quick confirm — your ConversionIQ demo${valid ? `, ${date}` : ""}`;
  const body = [
    `Hi ${first},`,
    "",
    `Looking forward to showing you how ${company} can catch the after-hours leads that slip through today.`,
    "",
    valid ? `When:  ${date}${time ? ` at ${time}` : ""}` : "When:  (see calendar invite)",
    `${input.demoOwner} will walk you through it — about 15 minutes, nothing to prep.`,
    "",
    "If that time no longer works, just reply here and we'll find a better one.",
    "",
    "Talk soon,",
    input.senderName,
  ].join("\n");

  return { subject, body };
}
