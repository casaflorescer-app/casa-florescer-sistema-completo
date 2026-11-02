import { publicAsset } from "@/lib/hosting";

export function FloralMark({ className = "h-16 w-16" }: { className?: string }) {
  return (
    <span className={`relative block shrink-0 overflow-hidden ${className}`} aria-hidden>
      <img
        src={publicAsset("/brand/logo-florescer.png")}
        alt=""
        className="absolute left-1/2 top-[-33%] h-[197%] w-[194%] max-w-none -translate-x-1/2 brightness-0 invert"
      />
    </span>
  );
}

export function BrandMark({
  compact = false,
  stacked = false,
  subtitle = "Clínica",
  tone = "ink",
}: {
  compact?: boolean;
  stacked?: boolean;
  subtitle?: string;
  tone?: "ink" | "light";
}) {
  const title = tone === "light" ? "text-white" : "text-lotus-600";
  const note = tone === "light" ? "text-white/80" : "text-lotus-800";
  if (stacked) {
    return (
      <div className="flex w-full flex-col items-center gap-2 text-center">
        <FloralMark />
        {!compact ? (
          <div>
            <p className={`text-[15px] font-semibold leading-tight ${title}`}>Casa Florescer</p>
            <p className={`mt-1 text-[11px] leading-snug ${note}`}>{subtitle}</p>
          </div>
        ) : null}
      </div>
    );
  }
  return (
    <div className="flex items-center gap-3">
      <img
        src={publicAsset("/brand/logo-florescer.png")}
        alt="Casa Florescer"
        width={compact ? 40 : 52}
        height={compact ? 40 : 52}
        className="h-10 w-10 shrink-0 object-contain"
      />
      {!compact ? (
        <div className="min-w-0">
          <p className={`text-[11px] font-semibold uppercase tracking-brand ${title}`}>Casa Florescer</p>
          <p className={`text-sm ${note}`}>{subtitle}</p>
        </div>
      ) : null}
    </div>
  );
}
