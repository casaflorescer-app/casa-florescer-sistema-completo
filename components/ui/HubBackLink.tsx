import Link from "next/link";

/** Volta ao hub pai sem prender o usuário na subpágina. */
export function HubBackLink({
  href,
  label,
}: {
  href: string;
  label: string;
}) {
  return (
    <p className="mb-3">
      <Link
        href={href}
        className="text-sm font-medium text-lotus-700 underline-offset-2 hover:underline"
      >
        ← {label}
      </Link>
    </p>
  );
}
