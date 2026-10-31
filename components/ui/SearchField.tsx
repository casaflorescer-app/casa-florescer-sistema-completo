"use client";

import { Search } from "lucide-react";
import { fieldClass } from "@/components/platform/Ui";

/**
 * Busca livre de tabela (não confundir com EntityCombobox).
 * C070-C4.3
 */
export function SearchField({
  value,
  onChange,
  placeholder = "Pesquisar…",
  "aria-label": ariaLabel,
  className = "",
  id,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  "aria-label"?: string;
  className?: string;
  id?: string;
}) {
  return (
    <div className={`relative max-w-md ${className}`} data-search-field="true">
      <Search
        className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-lotus-400"
        aria-hidden
      />
      <input
        id={id}
        className={`${fieldClass} mt-0 pl-9`}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        aria-label={ariaLabel ?? placeholder}
        type="search"
        autoComplete="off"
      />
    </div>
  );
}
