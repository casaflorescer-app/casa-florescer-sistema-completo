"use client";

import Link from "next/link";

export function NavItem({
  href,
  label,
  active,
  onNavigate,
}: {
  href: string;
  label: string;
  active: boolean;
  onNavigate?: () => void;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      onClick={onNavigate}
      className={`flex items-center rounded-xl px-3 py-2 text-sm transition-colors ${
        active
          ? "bg-lotus-100 font-medium text-lotus-900"
          : "text-lotus-700 hover:bg-lotus-50 hover:text-lotus-900"
      }`}
    >
      {label}
    </Link>
  );
}
