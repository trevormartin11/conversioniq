"use client";

import { useState, useTransition } from "react";
import { Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { rewriteVariantAction, updateVariantAction } from "@/app/(dashboard)/campaigns/[id]/actions";

const PRESETS: { label: string; instruction: string }[] = [
  { label: "Shorter", instruction: "Make it noticeably shorter and tighter without losing the hook." },
  { label: "Warmer", instruction: "Make the tone warmer and more casual, like a real person wrote it." },
  { label: "More direct", instruction: "Make it more direct and confident — cut the hedging and filler." },
  { label: "Punchier subject", instruction: "Rewrite the subject line to be shorter and more curiosity-driving (lowercase)." },
  { label: "Lead with the pain", instruction: "Open the body with the prospect's missed-revenue / after-hours pain in the first line." },
];

/** Inline editor for one sequence variant's copy — manual edits + AI rewrites. Saves to the hub copy. */
export function EditableVariant({ id, subject: s0, body: b0, aiOn }: { id: string; subject: string; body: string; aiOn: boolean }) {
  const [subject, setSubject] = useState(s0);
  const [body, setBody] = useState(b0);
  const [instruction, setInstruction] = useState("");
  const [saving, startSave] = useTransition();
  const [rewriting, startRewrite] = useTransition();
  const dirty = subject !== s0 || body !== b0;
  const busy = saving || rewriting;

  function save() {
    startSave(async () => {
      const r = await updateVariantAction(id, subject, body);
      if (!r.ok) toast.error(r.error ?? "Could not save copy.");
      else toast.success("Copy saved");
    });
  }

  function rewrite(instr: string) {
    if (!instr.trim()) return;
    startRewrite(async () => {
      const r = await rewriteVariantAction(id, instr);
      if (!r.ok) { toast.error(r.error ?? "Rewrite failed."); return; }
      if (r.source === "rules") { toast.error("Add a Claude (Anthropic) key to enable AI edits."); return; }
      setSubject(r.subject);
      setBody(r.body);
      toast.success("Rewritten — review and save");
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

      {/* AI edit controls */}
      <div className="rounded-md border border-ink-800 bg-ink-900/40 p-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-400"><Wand2 className="h-3.5 w-3.5 text-brand-400" /> AI edit</span>
          {PRESETS.map((p) => (
            <button
              key={p.label}
              disabled={busy || !aiOn}
              onClick={() => rewrite(p.instruction)}
              className="rounded-full border border-ink-700 bg-ink-850 px-2.5 py-1 text-[11px] text-slate-300 transition-colors hover:border-brand-500/40 hover:text-brand-300 disabled:opacity-40"
            >
              {p.label}
            </button>
          ))}
        </div>
        <div className="mt-1.5 flex gap-1.5">
          <input
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") rewrite(instruction); }}
            disabled={busy || !aiOn}
            placeholder={aiOn ? "Or describe the change… (e.g. add a one-line stat)" : "Connect Claude (Anthropic) to enable AI edits"}
            className="h-8 flex-1 rounded-md border border-ink-700 bg-ink-950 px-2.5 text-xs text-slate-200 focus:border-brand-500 focus:outline-none disabled:opacity-50"
          />
          <Button size="sm" variant="secondary" disabled={busy || !aiOn || !instruction.trim()} onClick={() => rewrite(instruction)}>
            {rewriting ? "Rewriting…" : "Rewrite"}
          </Button>
        </div>
      </div>

      {dirty && (
        <div className="flex gap-2">
          <Button size="sm" variant="primary" disabled={busy} onClick={save}>Save copy</Button>
          <Button size="sm" variant="ghost" disabled={busy} onClick={() => { setSubject(s0); setBody(b0); }}>Reset</Button>
        </div>
      )}
    </div>
  );
}
