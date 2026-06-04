"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createCampaignAction } from "@/app/(dashboard)/campaigns/actions";
import type { Persona } from "@/lib/data/types";

export function NewCampaignForm({ personas }: { personas: Pick<Persona, "id" | "name">[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState("");
  const [vertical, setVertical] = useState("");
  const [personaId, setPersonaId] = useState(personas[0]?.id ?? "");
  const [dailyCap, setDailyCap] = useState("80");
  const [error, setError] = useState<string | null>(null);

  function submit() {
    setError(null);
    startTransition(async () => {
      const res = await createCampaignAction({ name, vertical, personaId, dailyCap: Number(dailyCap) });
      if (!res.ok) {
        setError(res.error ?? "Something went wrong.");
        return;
      }
      setName("");
      setVertical("");
      setOpen(false);
      router.refresh();
    });
  }

  if (!open) {
    return (
      <Button variant="primary" onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4" /> New
      </Button>
    );
  }

  return (
    <div className="card w-full p-4 sm:w-auto sm:min-w-80">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-100">Stage a campaign</h3>
        <button onClick={() => setOpen(false)} className="rounded p-1 text-slate-500 hover:bg-ink-700" aria-label="Close">
          <X className="h-4 w-4" />
        </button>
      </div>
      <p className="mt-0.5 text-xs text-slate-500">Creates a draft cell. It stays off until you launch it in Instantly.</p>
      <div className="mt-3 space-y-2">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name (e.g. Med Spa — Texas)" className="h-10 w-full rounded-lg border border-ink-700 bg-ink-950 px-3 text-sm text-slate-200 focus:border-brand-500 focus:outline-none" />
        <input value={vertical} onChange={(e) => setVertical(e.target.value)} placeholder="Vertical (e.g. Med Spa)" className="h-10 w-full rounded-lg border border-ink-700 bg-ink-950 px-3 text-sm text-slate-200 focus:border-brand-500 focus:outline-none" />
        <div className="flex gap-2">
          <select value={personaId} onChange={(e) => setPersonaId(e.target.value)} className="h-10 flex-1 rounded-lg border border-ink-700 bg-ink-950 px-2 text-sm text-slate-200 focus:border-brand-500 focus:outline-none">
            {personas.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
          <input value={dailyCap} onChange={(e) => setDailyCap(e.target.value)} type="number" inputMode="numeric" className="h-10 w-24 rounded-lg border border-ink-700 bg-ink-950 px-3 text-sm text-slate-200 focus:border-brand-500 focus:outline-none" />
        </div>
        {error && <p className="text-xs text-bad">{error}</p>}
        <Button variant="primary" className="w-full" disabled={pending || !name.trim()} onClick={submit}>
          {pending ? "Staging…" : "Stage draft campaign"}
        </Button>
      </div>
    </div>
  );
}
