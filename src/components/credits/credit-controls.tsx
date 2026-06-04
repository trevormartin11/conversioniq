"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Check, Lock, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ago, num } from "@/lib/format";
import {
  approveCreditAction,
  denyCreditAction,
  executeCreditSpendAction,
  requestCreditAction,
} from "@/app/(dashboard)/credits/actions";

export interface RequestView {
  id: string;
  amount: number;
  reason: string;
  requestedBy: string;
  status: "pending" | "approved" | "denied" | "executed";
  createdAt: string;
}

export function CreditControls({ requests, currentUser }: { requests: RequestView[]; currentUser: string }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [confirmId, setConfirmId] = useState<string | null>(null);

  async function run(key: string, fn: () => Promise<unknown>) {
    setBusy(key);
    await fn();
    setBusy(null);
    startTransition(() => router.refresh());
  }

  return (
    <div className="space-y-5">
      {/* Request new spend */}
      <div className="card p-4">
        <h3 className="text-sm font-semibold text-slate-100">Request CIQ credit spend</h3>
        <p className="text-xs text-slate-500">Creates a gated request. A partner must approve before any credits are spent.</p>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <input
            type="number"
            inputMode="numeric"
            placeholder="Credits (e.g. 500)"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="h-10 w-full rounded-lg border border-ink-700 bg-ink-950 px-3 text-sm text-slate-200 focus:border-brand-500 focus:outline-none sm:w-44"
          />
          <input
            placeholder="Reason (what's it for?)"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="h-10 flex-1 rounded-lg border border-ink-700 bg-ink-950 px-3 text-sm text-slate-200 focus:border-brand-500 focus:outline-none"
          />
          <Button
            variant="primary"
            disabled={busy === "request" || !amount}
            onClick={() => run("request", async () => { await requestCreditAction(Number(amount), reason); setAmount(""); setReason(""); })}
          >
            Request
          </Button>
        </div>
      </div>

      {/* Pending + history */}
      <div className="space-y-2">
        {requests.length === 0 && <p className="text-sm text-slate-500">No spend requests yet.</p>}
        {requests.map((r) => (
          <div key={r.id} className="card p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-slate-100">{num(r.amount)} CIQ credits</p>
                <p className="text-xs text-slate-500">{r.reason}</p>
                <p className="mt-1 text-[11px] text-slate-600">Requested by {r.requestedBy} · {ago(r.createdAt)}</p>
              </div>
              <StatusPill status={r.status} />
            </div>

            {r.status === "pending" && (
              <div className="mt-3 flex gap-2">
                <Button size="sm" variant="ok" disabled={busy === r.id} onClick={() => run(r.id, () => approveCreditAction(r.id))}>
                  <Check className="h-3.5 w-3.5" /> Approve
                </Button>
                <Button size="sm" variant="ghost" disabled={busy === r.id} onClick={() => run(r.id, () => denyCreditAction(r.id))}>
                  <X className="h-3.5 w-3.5" /> Deny
                </Button>
              </div>
            )}

            {r.status === "approved" && (
              <div className="mt-3">
                {confirmId === r.id ? (
                  <div className="rounded-lg border border-bad/40 bg-bad/10 p-3">
                    <div className="flex items-center gap-2 text-sm font-medium text-bad">
                      <AlertTriangle className="h-4 w-4" /> Confirm: spend {num(r.amount)} paid CIQ credits?
                    </div>
                    <p className="mt-1 text-xs text-slate-400">This is the only action that spends CIQ credits. It will be audit-logged to {currentUser}.</p>
                    <div className="mt-2 flex gap-2">
                      <Button size="sm" variant="danger" disabled={busy === r.id} onClick={() => run(r.id, async () => { await executeCreditSpendAction(r.id); setConfirmId(null); })}>
                        Yes, spend {num(r.amount)}
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setConfirmId(null)}>Cancel</Button>
                    </div>
                  </div>
                ) : (
                  <Button size="sm" variant="secondary" onClick={() => setConfirmId(r.id)}>
                    <Lock className="h-3.5 w-3.5" /> Execute spend…
                  </Button>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function StatusPill({ status }: { status: RequestView["status"] }) {
  const map = {
    pending: "bg-warn/15 text-warn",
    approved: "bg-brand/15 text-brand-400",
    denied: "bg-slate-500/15 text-slate-400",
    executed: "bg-ok/15 text-ok",
  }[status];
  return <span className={`chip ${map}`}>{status}</span>;
}
