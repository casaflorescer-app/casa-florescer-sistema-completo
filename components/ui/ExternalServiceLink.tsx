import { ExternalLink } from "lucide-react";
import { buttonVariantClass, type ButtonVariant } from "@/components/ui/buttonStyles";

/**
 * Atalho para serviço externo — sempre nova aba (sem iframe).
 */
export function ExternalServiceLink({
  href,
  label,
  variant = "primary",
  className = "",
}: {
  href: string;
  label: string;
  variant?: ButtonVariant;
  className?: string;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={`${buttonVariantClass[variant]} ${className}`}
      data-external-service-link="true"
    >
      <span>{label}</span>
      <ExternalLink className="h-4 w-4 shrink-0" aria-hidden />
      <span className="sr-only">(abre em nova aba)</span>
    </a>
  );
}
