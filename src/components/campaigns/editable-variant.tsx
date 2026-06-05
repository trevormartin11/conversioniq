"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { updateVariantAction } from "@/app/(dashboard)/campaigns/[id]/actions";

/** Inline editor for one sequence variant's copy. Saves to the hub copy of record. */
export function EditableVariant({ id, subject: s0, body: b0 }: { id: string; subject: string; body: string }) {
  const [subject, setSubject] = useState(s0);
  const [body, setBody] = useState(b0);
  const [busy, start] = useTransition();
  const dirty = subject !== s0 || body !== b0;

  function save() {
    start(async () => {
      const r = await updateVariantAction(id, subject, body);
      if (!r.ok) toast.error(r.error ?? "Could not save copy.");
      else toast.success("Copy saved");
    });
  }

  return (
    <div className="space-y-1.5">
      <input
        value={subject}
        onChange={(e) => setSubject(e.target.value)}
        placeholder="Subject line"
        className="w-full rounded-md border border-ink-700 bg-ink-950 px-2.5 py-1.5 text-sm font-semibold text-slate-100 focus:border-brand-500 focus:outline-none"
      />
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={6}
        placeholder="Body — use {{firstName}} / {{companyName}} merge tags"
        className="w-full resize-y rounded-md border border-ink-700 bg-ink-950 px-2.5 py-2 text-sm leading-relaxed text-slate-300 focus:border-brand-500 focus:outline-none"
      />
      {dirty && (
        <div className="flex gap-2">
          <Button size="sm" variant="primary" disabled={busy} onClick={save}>Save copy</Button>
          <Button size="sm" variant="ghost" disabled={busy} onClick={() => { setSubject(s0); setBody(b0); }}>Reset</Button>
        </div>
      )}
    </div>
  );
}
