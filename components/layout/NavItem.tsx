"use client";

import type { ReactNode } from "react";
import Link from "next/link";

export function NavItem({
  href,
  label,
  active,
  external = false,
  onNavigate,
  icon,
  tone = "paper",
}: {
  href: string;
  label: string;
  active: boolean;
  external?: boolean;
  onNavigate?: () => void;
  icon?: ReactNode;
  tone?: "paper" | "plum";
}) {
  const className = `flex min-h-10 items-center gap-2 rounded-lg px-2.5 py-2 text-[13px] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white ${
    tone === "plum"
      ? active
        ? "bg-casa-rose font-medium text-white"
        : "text-white/85 hover:bg-white/10 hover:text-white"
      : active
        ? "bg-lotus-100 font-medium text-lotus-900"
        : "text-lotus-700 hover:bg-lotus-50 hover:text-lotus-900"
  }`;

  if (external) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        onClick={onNavigate}
        className={className}
        data-nav-external="true"
      >
        {icon}
        <span className="min-w-0 flex-1 truncate">{label}</span>
        <span className="ml-1 shrink-0 text-lotus-500" aria-hidden>
          ↗
        </span>
        <span className="sr-only">(abre em nova aba)</span>
      </a>
    );
  }

  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      onClick={onNavigate}
      className={className}
    >
      {icon}
      <span className="min-w-0 flex-1 truncate">{label}</span>
    </Link>
  );
}
