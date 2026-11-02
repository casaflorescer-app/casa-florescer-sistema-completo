import { publicAsset } from "@/lib/hosting";

export function BrandMark({
  compact = false,
  subtitle = "Clínica",
  tone = "ink",
}: {
  compact?: boolean;
  subtitle?: string;
  tone?: "ink" | "light";
}) {
  const title = tone === "light" ? "text-white" : "text-lotus-600";
  const note = tone === "light" ? "text-white/75" : "text-lotus-800";
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
          <p className={`text-[11px] font-semibold uppercase tracking-brand ${title}`}>
            Casa Florescer
          </p>
          <p className={`text-sm ${note}`}>{subtitle}</p>
        </div>
      ) : null}
    </div>
  );
}
