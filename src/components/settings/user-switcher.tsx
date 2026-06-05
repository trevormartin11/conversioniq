"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { switchUserAction } from "@/app/(dashboard)/settings/actions";
import type { User } from "@/lib/data/types";

export function UserSwitcher({ partners, currentId }: { partners: User[]; currentId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function switchTo(id: string) {
    startTransition(async () => {
      await switchUserAction(id);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-wrap gap-2">
      {partners.map((p) => (
        <button
          key={p.id}
          disabled={pending}
          onClick={() => switchTo(p.id)}
          className={cn(
            "flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors",
            p.id === currentId ? "border-brand-500 bg-brand-600/15 text-slate-100" : "border-ink-700 bg-ink-850 text-slate-300 hover:border-ink-600",
          )}
        >
          <span className="flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-semibold text-white" style={{ backgroundColor: p.avatarColor }}>
            {p.name.split(" ").map((n) => n[0]).join("")}
          </span>
          {p.name}
        </button>
      ))}
    </div>
  );
}
