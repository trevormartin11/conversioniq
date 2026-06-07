"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus, Trash2, Pause, Play, MessageSquare } from "lucide-react";
import { Card, CardBody, Empty, SectionHeader } from "@/components/ui/card";
import { HealthDot, Tag } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { OUTREACH_CHANNELS, OUTREACH_CHANNEL_LABELS, TENDLC_STATUSES } from "@/lib/data/types";
import type { ChannelAccount, ChannelAccountStatus, Health, OutreachChannel, TenDlcStatus } from "@/lib/data/types";
import { addChannelAccountAction, removeChannelAccountAction, updateChannelAccountAction } from "@/app/(dashboard)/channels/actions";

const ACCOUNT_HEALTH: Record<ChannelAccountStatus, Health> = { active: "green", warming: "yellow", pending: "yellow", error: "red" };
const STATUS_LABEL: Record<ChannelAccountStatus, string> = { active: "Active", warming: "Warming", pending: "Paused", error: "Error" };
const STATUS_TONE: Record<ChannelAccountStatus, "ok" | "warn" | "slate" | "bad"> = { active: "ok", warming: "warn", pending: "slate", error: "bad" };
// Advisory "safe" daily ceilings — social platforms throttle/ban aggressively above these.
const SAFE_CAP: Record<OutreachChannel, number> = { sms: 250, linkedin: 25, instagram: 40 };
const inputCls = "h-9 w-full rounded-lg border border-ink-700 bg-ink-950 px-2.5 text-sm text-slate-200 focus:border-brand-500 focus:outline-none";

export function AccountsPanel({ accounts }: { accounts: ChannelAccount[] }) {
  const channelsWithAccts = OUTREACH_CHANNELS.filter((ch) => accounts.some((a) => a.channel === ch));
  return (
    <div className="space-y-4">
      <AddAccountForm />
      <div className="space-y-3">
        <SectionHeader title="Sending accounts" subtitle="Each account sends at its own human-paced daily cap — the chokepoint that keeps numbers and profiles unbanned." />
        {accounts.length === 0 ? (
          <Empty icon={MessageSquare} title="No sending accounts yet">Add an SMS number or a social account above to start sending on that channel.</Empty>
        ) : (
          channelsWithAccts.map((ch) => (
            <div key={ch} className="space-y-2">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{OUTREACH_CHANNEL_LABELS[ch]}</p>
              {accounts.filter((a) => a.channel === ch).map((a) => (
                <AccountRow key={a.id} account={a} />
              ))}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function AddAccountForm() {
  const router = useRouter();
  const [channel, setChannel] = useState<OutreachChannel>("sms");
  const [label, setLabel] = useState("");
  const [identifier, setIdentifier] = useState("");
  const [dailyCap, setDailyCap] = useState<number>(SAFE_CAP.sms);
  const [tenDlc, setTenDlc] = useState<TenDlcStatus>("pending");
  const [note, setNote] = useState("");
  const [busy, start] = useTransition();
  const isSms = channel === "sms";
  const overSafe = dailyCap > SAFE_CAP[channel];

  function changeChannel(ch: OutreachChannel) {
    setChannel(ch);
    setDailyCap(SAFE_CAP[ch]);
  }

  function submit() {
    if (!label.trim()) {
      toast.error("Give the account a label.");
      return;
    }
    if (!identifier.trim()) {
      toast.error(isSms ? "Enter the phone number." : "Enter the account handle.");
      return;
    }
    start(async () => {
      const r = await addChannelAccountAction({ channel, label, identifier, dailyCap, tenDlc: isSms ? tenDlc : undefined, note: note || undefined });
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success("Sending account added");
      setLabel("");
      setIdentifier("");
      setNote("");
      router.refresh();
    });
  }

  return (
    <Card>
      <CardBody className="space-y-3">
        <SectionHeader title="Add a sending account" subtitle="Register a number or social account you control. SMS needs a real number; social accounts are the profiles you'll send DMs from." />
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <p className="mb-1 text-xs font-medium text-slate-400">Channel</p>
            <select value={channel} onChange={(e) => changeChannel(e.target.value as OutreachChannel)} className={inputCls}>
              {OUTREACH_CHANNELS.map((ch) => (
                <option key={ch} value={ch}>{OUTREACH_CHANNEL_LABELS[ch]}</option>
              ))}
            </select>
          </div>
          <div>
            <p className="mb-1 text-xs font-medium text-slate-400">Label</p>
            <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder={isSms ? "Main SMS line" : "Founder LinkedIn"} className={inputCls} />
          </div>
          <div>
            <p className="mb-1 text-xs font-medium text-slate-400">{isSms ? "Phone (E.164)" : "Account handle"}</p>
            <input value={identifier} onChange={(e) => setIdentifier(e.target.value)} placeholder={isSms ? "+14155550123" : "@yourbrand"} className={inputCls} />
          </div>
          <div>
            <p className="mb-1 text-xs font-medium text-slate-400">Daily cap</p>
            <input type="number" min={1} max={1000} value={dailyCap} onChange={(e) => setDailyCap(Number(e.target.value))} className={inputCls} />
          </div>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          {isSms && (
            <div>
              <p className="mb-1 text-xs font-medium text-slate-400">10DLC registration</p>
              <select value={tenDlc} onChange={(e) => setTenDlc(e.target.value as TenDlcStatus)} className={inputCls}>
                {TENDLC_STATUSES.filter((s) => s !== "n/a").map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
          )}
          <div className={isSms ? "" : "sm:col-span-2"}>
            <p className="mb-1 text-xs font-medium text-slate-400">Note (optional)</p>
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder={isSms ? "e.g. warm replies only" : "e.g. primary outreach profile"} className={inputCls} />
          </div>
        </div>
        {overSafe && (
          <p className="text-[11px] text-amber-300">
            {dailyCap}/day is above the safe pace for {OUTREACH_CHANNEL_LABELS[channel]} (~{SAFE_CAP[channel]}/day) — higher volume risks throttling or a ban.
          </p>
        )}
        <div className="flex items-center gap-2">
          <Button variant="primary" size="sm" disabled={busy} onClick={submit}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Add account
          </Button>
          {isSms && <span className="text-[11px] text-slate-500">Unregistered 10DLC traffic is heavily filtered by US carriers — register before scaling.</span>}
        </div>
      </CardBody>
    </Card>
  );
}

function AccountRow({ account }: { account: ChannelAccount }) {
  const router = useRouter();
  const [cap, setCap] = useState(account.dailyCap);
  const [tenDlc, setTenDlc] = useState<TenDlcStatus>(account.tenDlc);
  const [busy, start] = useTransition();
  const isSms = account.channel === "sms";
  const paused = account.status === "pending";
  const dirty = cap !== account.dailyCap || tenDlc !== account.tenDlc;
  const overSafe = cap > SAFE_CAP[account.channel];

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

  return (
    <Card>
      <CardBody className="space-y-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <HealthDot health={ACCOUNT_HEALTH[account.status]} />
            <span className="truncate text-sm font-medium text-slate-100">{account.label}</span>
            <span className="truncate text-xs text-slate-500">{account.identifier}</span>
          </div>
          <div className="flex items-center gap-2">
            <Tag tone={STATUS_TONE[account.status]}>{STATUS_LABEL[account.status]}</Tag>
            {isSms && <Tag tone={account.tenDlc === "registered" ? "ok" : "warn"}>10DLC {account.tenDlc}</Tag>}
            <span className="text-[11px] text-slate-500">{account.sentToday}/{account.dailyCap} today</span>
          </div>
        </div>

        <div className="flex flex-wrap items-end gap-3">
          <div>
            <p className="mb-1 text-[11px] font-medium text-slate-400">Daily cap</p>
            <input type="number" min={1} max={1000} value={cap} onChange={(e) => setCap(Number(e.target.value))} className="h-8 w-24 rounded-lg border border-ink-700 bg-ink-950 px-2 text-sm text-slate-200 focus:border-brand-500 focus:outline-none" />
          </div>
          {isSms && (
            <div>
              <p className="mb-1 text-[11px] font-medium text-slate-400">10DLC</p>
              <select value={tenDlc} onChange={(e) => setTenDlc(e.target.value as TenDlcStatus)} className="h-8 rounded-lg border border-ink-700 bg-ink-950 px-2 text-sm text-slate-200 focus:border-brand-500 focus:outline-none">
                {TENDLC_STATUSES.filter((s) => s !== "n/a").map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
          )}
          <div className="flex flex-1 flex-wrap items-center justify-end gap-1.5">
            {dirty && (
              <Button size="sm" variant="secondary" disabled={busy} onClick={() => run(() => updateChannelAccountAction(account.id, { dailyCap: cap, tenDlc: isSms ? tenDlc : undefined }), "Saved")}>
                Save
              </Button>
            )}
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => run(() => updateChannelAccountAction(account.id, { status: paused ? "active" : "pending" }), paused ? "Activated" : "Paused")}>
              {paused ? <><Play className="h-3.5 w-3.5" /> Activate</> : <><Pause className="h-3.5 w-3.5" /> Pause</>}
            </Button>
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => run(() => removeChannelAccountAction(account.id), "Account removed")}>
              <Trash2 className="h-3.5 w-3.5" /> Remove
            </Button>
          </div>
        </div>
        {overSafe && <p className="text-[11px] text-amber-300">Above the safe pace for {OUTREACH_CHANNEL_LABELS[account.channel]} (~{SAFE_CAP[account.channel]}/day).</p>}
      </CardBody>
    </Card>
  );
}
