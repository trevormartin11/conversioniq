"use client";

import { useEffect } from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // Surface to the console; wire to an error tracker in production.
    console.error(error);
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center gap-4 py-20 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-bad/15 text-bad">
        <AlertTriangle className="h-6 w-6" />
      </span>
      <div>
        <h2 className="text-lg font-semibold text-slate-100">Something went wrong</h2>
        <p className="mt-1 max-w-sm text-sm text-slate-500">
          This screen hit an error. Your data is safe — try again, and if it persists check the integration status in Settings.
        </p>
      </div>
      <Button variant="primary" onClick={reset}>Try again</Button>
    </div>
  );
}
