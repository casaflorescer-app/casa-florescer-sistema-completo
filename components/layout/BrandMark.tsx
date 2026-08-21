import Image from "next/image";

export function BrandMark({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <Image
        src="/brand/logo-florescer.png"
        alt="Casa Florescer"
        width={compact ? 40 : 52}
        height={compact ? 40 : 52}
        className="h-10 w-10 object-contain"
        priority
        unoptimized
      />
      {!compact ? (
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-brand text-lotus-600">
            Casa Florescer
          </p>
          <p className="text-sm text-lotus-800">Clínica</p>
        </div>
      ) : null}
    </div>
  );
}
