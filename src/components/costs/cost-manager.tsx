"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tag } from "@/components/ui/badge";
import { usd, titleCase } from "@/lib/format";
import { COST_CADENCES, COST_CATEGORIES, type CostCadence, type CostCategory } from "@/lib/data/types";
import { createCostAction, deleteCostAction } from "@/app/(dashboard)/costs/actions";
import { toast } from "@/components/ui/toast";

export interface CostView {
  id: string;
  category: CostCategory;
  vendor: string;
  description: string;
  amount: number;
  cadence: CostCadence;
  note: string | null;
}

const CADENCE_LABEL: Record<CostCadence, string> = { monthly: "/mo", annual: "/yr", one_time: "once" };

export function CostManager({ costs }: { costs: CostView[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [category, setCategory] = useState<CostCategory>("software");
  const [vendor, setVendor] = useState("");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [cadence, setCadence] = useState<CostCadence>("monthly");
  const [note, setNote] = useState("");

  function add() {
    setError(null);
    startTransition(async () => {
      const res = await createCostAction({ category, vendor, description, amount: Number(amount), cadence, note });
      if (!res.ok) return setError(res.error ?? "Something went wrong.");
      setVendor(""); setDescription(""); setAmount(""); setNote(""); setOpen(false);
      router.refresh();
    });
  }

  // Two-tap confirm (same pattern as campaign delete): a mis-tap on the trash icon used to
  // silently destroy a financial record with no confirmation and no feedback.
  function remove(id: string) {
    if (confirmId !== id) {
      setConfirmId(id);
      return;
    }
    setConfirmId(null);
    setBusy(id);
    startTransition(async () => {
      try {
        const res = await deleteCostAction(id);
        if (res && (res as { ok?: boolean }).ok === false) toast.error("Couldn't remove that cost — refresh and try again.");
        else toast.success("Cost removed");
      } catch {
        toast.error("Couldn't remove that cost — check your connection.");
      } finally {
        setBusy(null);
      }
      router.refresh();
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">Line items</h2>
        {!open && <Button size="sm" variant="primary" onClick={() => setOpen(true)}><Plus className="h-3.5 w-3.5" /> Add cost</Button>}
      </div>

      {open && (
        <div className="card p-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-100">New cost</h3>
            <button onClick={() => setOpen(false)} className="rounded p-1 text-slate-500 hover:bg-ink-700" aria-label="Close"><X className="h-4 w-4" /></button>
          </div>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <input value={vendor} onChange={(e) => setVendor(e.target.value)} placeholder="Vendor (e.g. Instantly)" className={inputCls} />
            <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Description" className={inputCls} />
            <select value={category} onChange={(e) => setCategory(e.target.value as CostCategory)} className={inputCls}>
              {COST_CATEGORIES.map((c) => <option key={c} value={c}>{titleCase(c)}</option>)}
            </select>
            <div className="flex gap-2">
              <input value={amount} onChange={(e) => setAmount(e.target.value)} type="number" inputMode="decimal" placeholder="$ amount" className={`${inputCls} flex-1`} />
              <select value={cadence} onChange={(e) => setCadence(e.target.value as CostCadence)} className={inputCls}>
                {COST_CADENCES.map((c) => <option key={c} value={c}>{titleCase(c)}</option>)}
              </select>
            </div>
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (optional)" className={`${inputCls} sm:col-span-2`} />
          </div>
          {error && <p className="mt-2 text-xs text-bad">{error}</p>}
          <div className="mt-3"><Button variant="primary" disabled={pending || !vendor.trim()} onClick={add}>{pending ? "Saving…" : "Save cost"}</Button></div>
        </div>
      )}

      <div className="card divide-y divide-ink-800">
        {costs.length === 0 && <p className="p-4 text-sm text-slate-500">No costs tracked yet.</p>}
        {costs.map((c) => (
          <div key={c.id} className="flex items-center justify-between gap-3 px-4 py-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-slate-100">{c.vendor} <span className="font-normal text-slate-500">· {c.description || titleCase(c.category)}</span></p>
              <div className="mt-0.5 flex items-center gap-2">
                <Tag tone="slate">{titleCase(c.category)}</Tag>
                {c.note && <span className="truncate text-[11px] text-slate-600">{c.note}</span>}
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-3">
              <span className="text-sm tabular-nums text-slate-200">{usd(c.amount)}<span className="text-xs text-slate-500"> {CADENCE_LABEL[c.cadence]}</span></span>
              {confirmId === c.id ? (
                <span className="flex items-center gap-1.5">
                  <button onClick={() => remove(c.id)} disabled={busy === c.id} className="rounded bg-bad/15 px-2 py-1 text-xs font-medium text-bad hover:bg-bad/25 disabled:opacity-50">Remove?</button>
                  <button onClick={() => setConfirmId(null)} className="rounded px-1.5 py-1 text-xs text-slate-500 hover:bg-ink-700">Cancel</button>
                </span>
              ) : (
                <button onClick={() => remove(c.id)} disabled={busy === c.id} className="rounded p-1.5 text-slate-500 hover:bg-bad/15 hover:text-bad disabled:opacity-50" aria-label="Remove cost">
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

const inputCls = "h-10 w-full rounded-lg border border-ink-700 bg-ink-950 px-3 text-sm text-slate-200 focus:border-brand-500 focus:outline-none";
