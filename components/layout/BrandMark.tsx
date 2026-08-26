import { publicAsset } from "@/lib/hosting";

export function BrandMark({
  compact = false,
  subtitle = "Clínica",
}: {
  compact?: boolean;
  subtitle?: string;
}) {
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
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-brand text-lotus-600">
            Casa Florescer
          </p>
          <p className="text-sm text-lotus-800">{subtitle}</p>
        </div>
      ) : null}
    </div>
  );
}
