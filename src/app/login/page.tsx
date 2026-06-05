import { Radio } from "lucide-react";
import { LoginForm } from "./login-form";

export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex items-center justify-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-brand-500 to-brand-700 text-white shadow-[0_0_12px_-2px] shadow-brand-600/50">
            <Radio className="h-4 w-4" />
          </span>
          <span className="text-lg font-semibold tracking-tight text-slate-100">
            CIQ <span className="text-slate-400">Hub</span>
          </span>
        </div>
        <LoginForm next={next ?? "/"} />
        <p className="mt-4 text-center text-xs text-slate-600">Control center for the CIQ outbound operation.</p>
      </div>
    </div>
  );
}
