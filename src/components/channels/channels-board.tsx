"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Ban, Clock, Copy, ExternalLink, Loader2, MessageSquare, Send, ShieldCheck, Sparkles, Wand2 } from "lucide-react";
import { Card, CardBody, Empty, SectionHeader } from "@/components/ui/card";
import { HealthDot, Tag } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import { ago } from "@/lib/format";
import { CONSENT_SOURCE_LABELS, CONSENT_SOURCES, OUTREACH_CHANNEL_LABELS } from "@/lib/data/types";
import type { ChannelAccount, ConsentRecord, ConsentSource, Health, OutreachChannel, OutreachMessage, OutreachStatus } from "@/lib/data/types";
import {
  captureConsentAction,
  draftOutreachAction,
  optOutAction,
  queueSocialFollowupsAction,
  regenerateOutreachAction,
  saveOutreachBodyAction,
  sendOutreachAction,
  skipOutreachAction,
} from "@/app/(dashboard)/channels/actions";
import { AccountsPanel } from "@/components/channels/accounts-panel";

type LeadLite = { id: string; name: string; company: string; title: string; vertical: string; phone: string | null; status: string };
type Tab = "social" | "sms" | "consent" | "accounts";

const STATUS_TAG: Record<OutreachStatus, { tone: "slate" | "brand" | "ok" | "warn" | "bad"; label: string }> = {
  needs_consent: { tone: "bad", label: "Needs consent" },
  draft: { tone: "slate", label: "Draft" },
  approved: { tone: "brand", label: "Ready to send" },
  sent: { tone: "ok", label: "Sent" },
  skipped: { tone: "slate", label: "Skipped" },
  failed: { tone: "bad", label: "Failed" },
};

const ACCOUNT_HEALTH: Record<ChannelAccount["status"], Health> = { active: "green", warming: "yellow", pending: "yellow", error: "red" };

export function ChannelsBoard({
  accounts,
  consent,
  outreach,
  leads,
  aiOn,
  twilioOn,
}: {
  accounts: ChannelAccount[];
  consent: ConsentRecord[];
  outreach: OutreachMessage[];
  leads: LeadLite[];
  aiOn: boolean;
  twilioOn: boolean;
}) {
  // Land on setup first when there's nothing to send from yet (fresh / live mode).
  const [tab, setTab] = useState<Tab>(accounts.length ? "social" : "accounts");

  const channels = useMemo(() => {
    const order: OutreachChannel[] = ["sms", "linkedin", "instagram"];
    return order
      .map((ch) => {
        const accts = accounts.filter((a) => a.channel === ch);
        if (!accts.length) return null;
        const cap = accts.reduce((s, a) => s + a.dailyCap, 0);
        const sentToday = accts.reduce((s, a) => s + a.sentToday, 0);
        const optedIn = ch === "sms" ? consent.filter((c) => c.channel === "sms" && c.status === "opted_in").length : null;
        const queued = outreach.filter((o) => o.channel === ch && (o.status === "draft" || o.status === "approved")).length;
        return { ch, accts, cap, sentToday, optedIn, queued };
      })
      .filter(Boolean) as { ch: OutreachChannel; accts: ChannelAccount[]; cap: number; sentToday: number; optedIn: number | null; queued: number }[];
  }, [accounts, consent, outreach]);

  const socialQueue = outreach.filter((o) => o.channel !== "sms" && o.status !== "skipped");
  const smsQueue = outreach.filter((o) => o.channel === "sms" && o.status !== "skipped");
  const needsConsentCount = smsQueue.filter((o) => o.status === "needs_consent").length;

  const TABS: { id: Tab; label: string; count?: number }[] = [
    { id: "social", label: "Social DM queue", count: socialQueue.filter((o) => o.status !== "sent").length },
    { id: "sms", label: "SMS", count: smsQueue.filter((o) => o.status !== "sent").length },
    { id: "consent", label: "Consent ledger", count: consent.filter((c) => c.status === "opted_in").length },
    { id: "accounts", label: "Sending accounts", count: accounts.length },
  ];

  return (
    <div className="space-y-5">
      {/* Per-channel status */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {channels.map(({ ch, accts, cap, sentToday, optedIn, queued }) => (
          <Card key={ch}>
            <CardBody className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <HealthDot health={ACCOUNT_HEALTH[accts[0].status]} pulse />
                  <span className="text-sm font-medium text-slate-100">{OUTREACH_CHANNEL_LABELS[ch]}</span>
                </div>
                {ch === "sms" ? (
                  <Tag tone={accts.some((a) => a.tenDlc === "registered") ? "ok" : "warn"}>
                    10DLC {accts[0].tenDlc}
                  </Tag>
                ) : (
                  <Tag tone="slate">human-sent</Tag>
                )}
              </div>
              <div className="flex items-end justify-between">
                <div>
                  <p className="text-2xl font-semibold text-slate-100">
                    {sentToday}
                    <span className="text-sm font-normal text-slate-500"> / {cap}</span>
                  </p>
                  <p className="text-[11px] text-slate-500">sent today · daily cap</p>
                </div>
                <div className="text-right text-[11px] text-slate-500">
                  {optedIn != null && <p>{optedIn} opted-in</p>}
                  <p>{queued} in queue</p>
                </div>
              </div>
              <p className="text-[11px] text-slate-500">{accts[0].note}</p>
            </CardBody>
          </Card>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-1.5">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm transition-colors",
              tab === t.id ? "bg-brand-gradient text-white" : "bg-ink-800 text-slate-300 hover:text-slate-100",
            )}
          >
            {t.label}
            {t.count != null && t.count > 0 && (
              <span className={cn("rounded-full px-1.5 py-0.5 text-[10px]", tab === t.id ? "bg-white/20" : "bg-ink-700 text-slate-400")}>{t.count}</span>
            )}
          </button>
        ))}
      </div>

      {tab === "social" && (
        <div className="space-y-4">
          <Card>
            <CardBody>
              <div className="flex items-start gap-2 text-xs text-slate-400">
                <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-brand-400" />
                <p>
                  The AI sources the prospect, drafts a personalized DM, and queues it. <span className="text-slate-300">You do the one thing platforms require a human for — the click.</span> Per-account caps keep accounts under the automation radar.
                </p>
              </div>
            </CardBody>
          </Card>
          <DraftComposer kind="social" leads={leads} aiOn={aiOn} />
          <div className="space-y-3">
            <div className="flex flex-wrap items-end justify-between gap-2">
              <SectionHeader title="Review queue" subtitle="AI-drafted DMs — edit, then open the profile and send at human pace." />
              <AutoQueueButton aiOn={aiOn} />
            </div>
            {socialQueue.length === 0 ? (
              <Empty icon={MessageSquare} title="No DMs queued">Draft one above, or let the sourcing job fill this queue.</Empty>
            ) : (
              socialQueue.map((m) => <OutreachCard key={m.id} msg={m} aiOn={aiOn} twilioOn={twilioOn} />)
            )}
          </div>
        </div>
      )}

      {tab === "sms" && (
        <div className="space-y-4">
          <Card>
            <CardBody>
              <div className="flex items-start gap-2 text-xs text-slate-400">
                <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-brand-400" />
                <p>
                  SMS is <span className="text-slate-300">consent-gated by the product</span>: a text can&apos;t send without a recorded opt-in, and STOP is honored automatically. That&apos;s how you get SMS&apos;s reply rates without the TCPA risk.
                  {needsConsentCount > 0 && <span className="text-amber-300"> {needsConsentCount} message{needsConsentCount > 1 ? "s are" : " is"} parked for missing consent — capture it in the Consent ledger.</span>}
                </p>
              </div>
            </CardBody>
          </Card>
          <DraftComposer kind="sms" leads={leads} aiOn={aiOn} />
          <div className="space-y-3">
            <SectionHeader title="SMS queue" subtitle={twilioOn ? "Consent-checked at send." : "Twilio not connected — sends simulate, but the consent gate still applies."} />
            {smsQueue.length === 0 ? (
              <Empty icon={Send} title="No texts queued">Draft one above. Remember: SMS is your warm-conversion layer, not cold outreach.</Empty>
            ) : (
              smsQueue.map((m) => <OutreachCard key={m.id} msg={m} aiOn={aiOn} twilioOn={twilioOn} />)
            )}
          </div>
        </div>
      )}

      {tab === "consent" && <ConsentLedger consent={consent} />}

      {tab === "accounts" && <AccountsPanel accounts={accounts} />}
    </div>
  );
}

// --- a single queued message ------------------------------------------------
function OutreachCard({ msg, aiOn, twilioOn }: { msg: OutreachMessage; aiOn: boolean; twilioOn: boolean }) {
  const router = useRouter();
  const isSms = msg.channel === "sms";
  const [body, setBody] = useState(msg.body);
  const [busy, start] = useTransition();
  const dirty = body.trim() !== msg.body.trim();
  const blocked = msg.status === "needs_consent";
  const done = msg.status === "sent";
  const st = STATUS_TAG[msg.status];
  const segments = Math.max(1, Math.ceil(body.length / 160));

  function run(fn: () => Promise<{ ok: boolean; error?: string }>, okMsg?: string) {
    start(async () => {
      const r = await fn();
      if (!r.ok) {
        toast.error(r.error ?? "Something went wrong.");
        return;
      }
      if (okMsg) toast.success(okMsg);
      router.refresh();
    });
  }

  function regenerate() {
    start(async () => {
      const r = await regenerateOutreachAction(msg.id);
      if (!r.ok) {
        toast.error(r.error ?? "Regenerate failed.");
        return;
      }
      if (r.source === "rules" && !aiOn) toast.error("Connect a Claude key for AI drafts — used a template.");
      setBody(r.body);
      router.refresh();
    });
  }

  function copy() {
    navigator.clipboard?.writeText(body).then(
      () => toast.success("Copied — paste it into the DM"),
      () => toast.error("Couldn't copy"),
    );
  }

  return (
    <Card>
      <CardBody className="space-y-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Tag tone={isSms ? "brand" : "slate"}>{OUTREACH_CHANNEL_LABELS[msg.channel]}</Tag>
            <span className="text-sm font-medium text-slate-100">{msg.toName}</span>
            <span className="text-xs text-slate-500">{msg.toHandle}</span>
          </div>
          <div className="flex items-center gap-2">
            <Tag tone={st.tone}>{st.label}</Tag>
            <span className="text-[11px] text-slate-500">{ago(msg.createdAt)}</span>
          </div>
        </div>

        {blocked && (
          <div className="flex items-start gap-2 rounded-lg border border-bad/25 bg-bad/10 p-2 text-[11px] text-red-300">
            <Ban className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <p>No opt-in on file for this number. Capture consent in the Consent ledger and this unblocks automatically — cold texting violates TCPA.</p>
          </div>
        )}

        {done ? (
          <p className="whitespace-pre-wrap rounded-lg bg-ink-900/40 p-2.5 text-sm text-slate-300">{msg.body}</p>
        ) : (
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={isSms ? 3 : 4}
            className="w-full resize-y rounded-lg border border-ink-700 bg-ink-950 px-2.5 py-2 text-sm leading-relaxed text-slate-300 focus:border-brand-500 focus:outline-none"
          />
        )}

        {msg.rationale && !done && <p className="text-[11px] text-slate-500">Why: {msg.rationale}</p>}

        {!done && (
          <div className="flex flex-wrap items-center gap-1.5">
            {isSms && <span className="mr-1 text-[11px] text-slate-500">{body.length} chars · {segments} segment{segments > 1 ? "s" : ""}</span>}
            <Button size="sm" variant="ghost" disabled={busy || !aiOn} onClick={regenerate}>
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wand2 className="h-3.5 w-3.5" />} Regenerate
            </Button>
            {dirty && (
              <Button size="sm" variant="secondary" disabled={busy} onClick={() => run(() => saveOutreachBodyAction(msg.id, body), "Saved")}>
                Save edit
              </Button>
            )}

            {/* Channel-specific send controls */}
            {isSms ? (
              <>
                <Button size="sm" variant="primary" disabled={busy || blocked} onClick={() => run(() => sendOutreachAction(msg.id), twilioOn ? "Text sent" : "Sent (simulated)")}>
                  <Send className="h-3.5 w-3.5" /> {twilioOn ? "Send SMS" : "Send (simulated)"}
                </Button>
                <Button size="sm" variant="ghost" disabled={busy} onClick={() => run(() => skipOutreachAction(msg.id))}>Skip</Button>
              </>
            ) : (
              <>
                <Button size="sm" variant="secondary" disabled={busy} onClick={copy}>
                  <Copy className="h-3.5 w-3.5" /> Copy
                </Button>
                {msg.profileUrl && (
                  <a href={msg.profileUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 rounded-lg border border-ink-700 bg-ink-850 px-2.5 py-1 text-[12px] text-slate-300 transition-colors hover:border-brand-500/40 hover:text-brand-300">
                    <ExternalLink className="h-3.5 w-3.5" /> Open in {OUTREACH_CHANNEL_LABELS[msg.channel]}
                  </a>
                )}
                <Button size="sm" variant="primary" disabled={busy} onClick={() => run(() => sendOutreachAction(msg.id), "Marked sent")}>
                  Mark sent
                </Button>
                <Button size="sm" variant="ghost" disabled={busy} onClick={() => run(() => skipOutreachAction(msg.id))}>Skip</Button>
              </>
            )}
          </div>
        )}

        {done && (
          <p className="text-[11px] text-slate-500">
            <Clock className="mr-1 inline h-3 w-3" />
            Sent {msg.sentAt ? ago(msg.sentAt) : ""}{msg.sentBy ? ` by ${msg.sentBy}` : ""}
          </p>
        )}
      </CardBody>
    </Card>
  );
}

// --- draft composer ---------------------------------------------------------
function DraftComposer({ kind, leads, aiOn }: { kind: "sms" | "social"; leads: LeadLite[]; aiOn: boolean }) {
  const router = useRouter();
  const [channel, setChannel] = useState<OutreachChannel>(kind === "sms" ? "sms" : "linkedin");
  const [leadId, setLeadId] = useState("");
  const [name, setName] = useState("");
  const [handle, setHandle] = useState("");
  const [signal, setSignal] = useState("");
  const [angle, setAngle] = useState("");
  const [profileUrl, setProfileUrl] = useState("");
  const [busy, start] = useTransition();

  function pickLead(id: string) {
    setLeadId(id);
    const lead = leads.find((l) => l.id === id);
    if (lead) {
      setName(lead.name);
      if (kind === "sms" && lead.phone) setHandle(lead.phone);
    }
  }

  function draft() {
    if (!handle.trim()) {
      toast.error(kind === "sms" ? "Enter the prospect's phone number." : "Enter the prospect's handle.");
      return;
    }
    start(async () => {
      const r = await draftOutreachAction({
        channel,
        leadId: leadId || undefined,
        toName: name || undefined,
        toHandle: handle,
        signal: signal || undefined,
        angle: angle || undefined,
        profileUrl: profileUrl || undefined,
      });
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success(r.status === "needs_consent" ? "Drafted — parked until consent is captured" : "Drafted to the queue");
      setLeadId("");
      setName("");
      setHandle("");
      setSignal("");
      setAngle("");
      setProfileUrl("");
      router.refresh();
    });
  }

  const inputCls = "h-9 w-full rounded-lg border border-ink-700 bg-ink-950 px-2.5 text-sm text-slate-200 focus:border-brand-500 focus:outline-none";

  return (
    <Card>
      <CardBody className="space-y-3">
        <SectionHeader title="Draft a message" subtitle={kind === "sms" ? "Pick an engaged contact; the AI writes a short, on-voice text." : "Pick a prospect; the AI writes a personalized DM for your one-click send."} />
        <div className="grid gap-2 sm:grid-cols-2">
          <div>
            <p className="mb-1 text-xs font-medium text-slate-400">Prospect</p>
            <select value={leadId} onChange={(e) => pickLead(e.target.value)} className={inputCls}>
              <option value="">— pick an engaged lead (optional) —</option>
              {leads.map((l) => (
                <option key={l.id} value={l.id}>{l.name} · {l.company}</option>
              ))}
            </select>
          </div>
          {kind === "social" ? (
            <div>
              <p className="mb-1 text-xs font-medium text-slate-400">Channel</p>
              <select value={channel} onChange={(e) => setChannel(e.target.value as OutreachChannel)} className={inputCls}>
                <option value="linkedin">LinkedIn</option>
                <option value="instagram">Instagram</option>
              </select>
            </div>
          ) : (
            <div>
              <p className="mb-1 text-xs font-medium text-slate-400">Phone (E.164)</p>
              <input value={handle} onChange={(e) => setHandle(e.target.value)} placeholder="+14155550123" className={inputCls} />
            </div>
          )}
        </div>
        {kind === "social" && (
          <div className="grid gap-2 sm:grid-cols-2">
            <div>
              <p className="mb-1 text-xs font-medium text-slate-400">Handle</p>
              <input value={handle} onChange={(e) => setHandle(e.target.value)} placeholder="first-last / @handle" className={inputCls} />
            </div>
            <div>
              <p className="mb-1 text-xs font-medium text-slate-400">Profile URL (for the click)</p>
              <input value={profileUrl} onChange={(e) => setProfileUrl(e.target.value)} placeholder="https://linkedin.com/in/…" className={inputCls} />
            </div>
          </div>
        )}
        {kind === "social" && (
          <div>
            <p className="mb-1 text-xs font-medium text-slate-400">Personalization signal (the opener hook)</p>
            <input value={signal} onChange={(e) => setSignal(e.target.value)} placeholder="e.g. just expanded to a 2nd location; posted about hiring" className={inputCls} />
          </div>
        )}
        <div>
          <p className="mb-1 text-xs font-medium text-slate-400">Angle / pain to lead with (optional)</p>
          <input value={angle} onChange={(e) => setAngle(e.target.value)} placeholder="e.g. after-hours DMs going unanswered" className={inputCls} />
        </div>
        <div className="flex items-center gap-2">
          <Button variant="primary" size="sm" disabled={busy} onClick={draft}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />} AI draft
          </Button>
          {!aiOn && <span className="text-[11px] text-slate-500">No Claude key — uses an on-voice template.</span>}
        </div>
      </CardBody>
    </Card>
  );
}

// --- consent ledger ---------------------------------------------------------
function ConsentLedger({ consent }: { consent: ConsentRecord[] }) {
  const router = useRouter();
  const [channel, setChannel] = useState<OutreachChannel>("sms");
  const [handle, setHandle] = useState("");
  const [source, setSource] = useState<ConsentSource>("reply_keyword");
  const [proof, setProof] = useState("");
  const [busy, start] = useTransition();

  function capture() {
    if (!handle.trim()) {
      toast.error("Enter a phone number or handle.");
      return;
    }
    start(async () => {
      const r = await captureConsentAction({ channel, handle, source, proof: proof || undefined });
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success("Opt-in recorded");
      setHandle("");
      setProof("");
      router.refresh();
    });
  }

  function optOut(c: ConsentRecord) {
    // Permanent + one-way from this screen (re-opt-in needs fresh consent at the top form) —
    // a mis-click must not silently kill a legally-consented channel.
    if (typeof window !== "undefined" && !window.confirm(`Record an opt-out for ${c.handle}? This permanently blocks sends until they opt in again.`)) return;
    start(async () => {
      const r = await optOutAction(c.channel, c.handle);
      if (!r.ok) {
        toast.error(r.error ?? "Failed.");
        return;
      }
      toast.success("Opt-out recorded — sends blocked");
      router.refresh();
    });
  }

  const inputCls = "h-9 w-full rounded-lg border border-ink-700 bg-ink-950 px-2.5 text-sm text-slate-200 focus:border-brand-500 focus:outline-none";
  const tone = (s: ConsentRecord["status"]) => (s === "opted_in" ? "ok" : s === "opted_out" ? "bad" : "warn");

  return (
    <div className="space-y-4">
      <Card>
        <CardBody className="space-y-3">
          <SectionHeader title="Capture consent" subtitle="The opt-in is what makes SMS legal — log how it was obtained." />
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <p className="mb-1 text-xs font-medium text-slate-400">Channel</p>
              <select value={channel} onChange={(e) => setChannel(e.target.value as OutreachChannel)} className={inputCls}>
                <option value="sms">SMS</option>
                <option value="linkedin">LinkedIn</option>
                <option value="instagram">Instagram</option>
              </select>
            </div>
            <div>
              <p className="mb-1 text-xs font-medium text-slate-400">Phone / handle</p>
              <input value={handle} onChange={(e) => setHandle(e.target.value)} placeholder={channel === "sms" ? "+14155550123" : "@handle"} className={inputCls} />
            </div>
            <div>
              <p className="mb-1 text-xs font-medium text-slate-400">How</p>
              <select value={source} onChange={(e) => setSource(e.target.value as ConsentSource)} className={inputCls}>
                {CONSENT_SOURCES.map((s) => (
                  <option key={s} value={s}>{CONSENT_SOURCE_LABELS[s]}</option>
                ))}
              </select>
            </div>
            <div>
              <p className="mb-1 text-xs font-medium text-slate-400">Proof / note</p>
              <input value={proof} onChange={(e) => setProof(e.target.value)} placeholder="e.g. replied YES on 6/3" className={inputCls} />
            </div>
          </div>
          <Button variant="primary" size="sm" disabled={busy} onClick={capture}>Record opt-in</Button>
        </CardBody>
      </Card>

      <div className="space-y-2">
        <SectionHeader title="Ledger" subtitle="Every contactable handle and its consent state — the global source of truth." />
        {consent.length === 0 ? (
          <Empty icon={ShieldCheck} title="No consent on file">Capture an opt-in above to start texting legally.</Empty>
        ) : (
          consent.map((c) => (
            <Card key={c.id}>
              <CardBody className="flex flex-wrap items-center justify-between gap-2 py-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <Tag tone="slate">{OUTREACH_CHANNEL_LABELS[c.channel]}</Tag>
                    <span className="text-sm font-medium text-slate-100">{c.handle}</span>
                    <Tag tone={tone(c.status)}>{c.status.replace("_", " ")}</Tag>
                  </div>
                  <p className="mt-0.5 truncate text-[11px] text-slate-500">
                    {CONSENT_SOURCE_LABELS[c.source]}
                    {c.proof ? ` · ${c.proof}` : ""} · {ago(c.updatedAt || c.capturedAt)}
                  </p>
                </div>
                {c.status !== "opted_out" && (
                  <Button size="sm" variant="ghost" disabled={busy} onClick={() => optOut(c)}>Record opt-out</Button>
                )}
              </CardBody>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}

/**
 * One click fills the DM queue from engaged email repliers: Apollo resolves each prospect's
 * LinkedIn from their email, the AI drafts the message, and the card arrives with the
 * profile deep link attached — zero manual lookup. Loops until the audience is exhausted.
 */
function AutoQueueButton({ aiOn }: { aiOn: boolean }) {
  const router = useRouter();
  const [running, setRunning] = useState(false);

  async function run() {
    setRunning(true);
    let queued = 0;
    let noProfile = 0;
    try {
      for (;;) {
        const r = await queueSocialFollowupsAction({ channel: "linkedin" });
        queued += r.queued;
        noProfile += r.noProfile.length;
        if (!r.more) break;
      }
      if (queued === 0 && noProfile === 0) toast.success("Queue is current — no engaged repliers awaiting a DM follow-up.");
      else toast.success(`Queued ${queued} DM${queued === 1 ? "" : "s"}${noProfile ? ` · ${noProfile} skipped (no LinkedIn found)` : ""}`);
    } catch {
      toast.error("Auto-queue stopped early — what's queued so far is kept. Run it again to continue.");
    } finally {
      setRunning(false);
      router.refresh();
    }
  }

  return (
    <Button size="sm" variant="primary" disabled={running} onClick={run} title={aiOn ? "Find engaged repliers, resolve their LinkedIn, draft DMs" : "Works without AI too — uses the template draft"}>
      {running ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
      {running ? "Queuing…" : "Auto-queue from engaged repliers"}
    </Button>
  );
}
