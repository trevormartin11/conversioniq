"use client";

import { useSyncExternalStore } from "react";
import { CheckCircle2, Info, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";

type Toast = { id: number; message: string; type: "success" | "error" | "info" };

let items: Toast[] = [];
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

function add(message: string, type: Toast["type"]) {
  const id = Date.now() + Math.random();
  items = [...items, { id, message, type }];
  emit();
  setTimeout(() => {
    items = items.filter((t) => t.id !== id);
    emit();
  }, 4500);
}

export const toast = {
  success: (m: string) => add(m, "success"),
  error: (m: string) => add(m, "error"),
  info: (m: string) => add(m, "info"),
};

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}
const snapshot = () => items;

export function Toaster() {
  const list = useSyncExternalStore(subscribe, snapshot, snapshot);
  if (!list.length) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-24 z-50 flex flex-col items-center gap-2 px-3 md:bottom-6">
      {list.map((t) => (
        <div
          key={t.id}
          role="status"
          className={cn(
            "pointer-events-auto flex max-w-md items-start gap-2 rounded-xl border px-4 py-3 text-sm shadow-lg backdrop-blur",
            t.type === "error" && "border-bad/30 bg-bad/15 text-red-200",
            t.type === "success" && "border-ok/30 bg-ok/15 text-emerald-200",
            t.type === "info" && "border-ink-700 bg-ink-850/95 text-slate-200",
          )}
        >
          {t.type === "error" ? <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-bad" /> : t.type === "success" ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-ok" /> : <Info className="mt-0.5 h-4 w-4 shrink-0 text-brand-400" />}
          <span>{t.message}</span>
        </div>
      ))}
    </div>
  );
}
