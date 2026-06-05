import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 text-center">
      <p className="text-5xl font-bold text-brand-500">404</p>
      <p className="text-sm text-slate-500">That screen doesn&apos;t exist.</p>
      <Link href="/" className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-500">
        Back to Command Center
      </Link>
    </div>
  );
}
