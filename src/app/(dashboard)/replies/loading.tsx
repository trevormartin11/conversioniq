export default function Loading() {
  return (
    <div className="space-y-5">
      <div className="h-8 w-48 animate-pulse rounded bg-ink-800" />
      <div className="h-28 animate-pulse rounded-2xl bg-ink-850" />
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-16 animate-pulse rounded-2xl bg-ink-850" />
        ))}
      </div>
    </div>
  );
}
