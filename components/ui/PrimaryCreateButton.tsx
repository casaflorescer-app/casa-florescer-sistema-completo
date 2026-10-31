import Link from "next/link";
import { Plus } from "lucide-react";
import { buttonVariantClass } from "@/components/ui/buttonStyles";

/**
 * CTA de criação no canto superior direito do PageHeader: "+ Nova sala", etc.
 */
export function PrimaryCreateButton({
  label,
  href,
  onClick,
  disabled,
}: {
  label: string;
  href?: string;
  onClick?: () => void;
  disabled?: boolean;
}) {
  const className = buttonVariantClass.primary;
  const content = (
    <>
      <Plus className="h-4 w-4 shrink-0" aria-hidden />
      <span>{label}</span>
    </>
  );

  if (href && !disabled) {
    return (
      <Link href={href} className={className} data-primary-create="true">
        {content}
      </Link>
    );
  }

  return (
    <button
      type="button"
      className={className}
      disabled={disabled}
      onClick={onClick}
      data-primary-create="true"
    >
      {content}
    </button>
  );
}
