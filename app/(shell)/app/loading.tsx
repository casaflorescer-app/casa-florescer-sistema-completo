export default function AppLoading() {
  return (
    <div className="space-y-4" aria-busy="true" aria-live="polite">
      <div className="h-48 animate-pulse rounded-[2rem] bg-white/80" />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="h-24 animate-pulse rounded-3xl bg-white/80" />
        <div className="h-24 animate-pulse rounded-3xl bg-white/80" />
        <div className="h-24 animate-pulse rounded-3xl bg-white/80" />
        <div className="h-24 animate-pulse rounded-3xl bg-white/80" />
      </div>
    </div>
  );
}
