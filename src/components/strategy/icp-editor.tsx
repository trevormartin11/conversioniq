"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, Pencil, RotateCcw } from "lucide-react";
import { Card, CardBody } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tag } from "@/components/ui/badge";
import { toast } from "@/components/ui/toast";
import { setIcpAction } from "@/app/(dashboard)/strategy/actions";

/**
 * The editable "who we win with" — the source-of-truth the strategy AI reads from. Saving steers
 * vertical/problem suggestions; clearing it falls back to the built-in default. `custom` marks
 * whether the shown text is an operator override or the default.
 */
export function IcpEditor({ value, custom, defaultText }: { value: string; custom: boolean; defaultText: string }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [busy, start] = useTransition();

  function save(text: string, msg: string) {
    start(async () => {
      const r = await setIcpAction(text);
      if (!r.ok) return toast.error("Couldn't save the ICP.");
      toast.success(msg);
      setEditing(false);
      router.refresh();
    });
  }

  return (
    <Card>
      <CardBody className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-slate-100">Who ConversionIQ wins with</span>
            <Tag tone={custom ? "brand" : "slate"}>{custom ? "custom" : "default"}</Tag>
          </div>
          {!editing && (
            <Button size="sm" variant="ghost" onClick={() => { setDraft(value); setEditing(true); }}>
              <Pencil className="h-3.5 w-3.5" /> Edit
            </Button>
          )}
        </div>

        {editing ? (
          <>
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={8}
              className="w-full resize-y rounded-lg border border-ink-700 bg-ink-950 p-3 text-sm leading-relaxed text-slate-200 focus:border-brand-500 focus:outline-none"
            />
            <p className="text-[11px] text-slate-500">The AI reads this when proposing target verticals and the problems to lead with. Be specific about the traits of a great-fit account.</p>
            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm" variant="primary" disabled={busy || !draft.trim()} onClick={() => save(draft, "ICP saved — the AI will use it.")}>
                {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />} Save
              </Button>
              <Button size="sm" variant="ghost" disabled={busy} onClick={() => setEditing(false)}>Cancel</Button>
              {custom && (
                <Button size="sm" variant="ghost" disabled={busy} onClick={() => save("", "Reset to the default ICP.")}>
                  <RotateCcw className="h-3.5 w-3.5" /> Reset to default
                </Button>
              )}
            </div>
            {custom && draft !== defaultText && (
              <button type="button" onClick={() => setDraft(defaultText)} className="text-[11px] font-medium text-brand-400 hover:text-brand-300">Load the default text to edit from →</button>
            )}
          </>
        ) : (
          <p className="text-sm leading-relaxed text-slate-300">{value}</p>
        )}
      </CardBody>
    </Card>
  );
}
