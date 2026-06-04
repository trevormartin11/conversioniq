import { Hammer } from "lucide-react";

/** Marks functionality that is scaffolded now and fully built in a later phase. */
export function PhaseBanner({ phase, children }: { phase: 2 | 3 | 4; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-brand-500/30 bg-brand-600/10 px-4 py-3 text-sm">
      <Hammer className="mt-0.5 h-4 w-4 shrink-0 text-brand-400" />
      <p className="text-slate-300">
        <span className="font-medium text-brand-400">Phase {phase}.</span> {children}
      </p>
    </div>
  );
}
