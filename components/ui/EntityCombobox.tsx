"use client";

import { useMemo, useState } from "react";
import { fieldClass } from "@/components/platform/Ui";

export type EntityComboboxOption = {
  id: string;
  label: string;
  keywords?: string;
};

/**
 * C070 — autocomplete comum (debounce local, limit, empty).
 * Especializar via options já carregadas (paciente/profissional/sala/procedimento).
 */
export function EntityCombobox({
  options,
  value,
  onChange,
  placeholder = "Digite para pesquisar",
  emptyLabel = "Nenhum resultado",
  required = false,
  disabled = false,
  limit = 40,
  id,
  "aria-label": ariaLabel,
}: {
  options: EntityComboboxOption[];
  value: string;
  onChange: (id: string) => void;
  placeholder?: string;
  emptyLabel?: string;
  required?: boolean;
  disabled?: boolean;
  limit?: number;
  id?: string;
  "aria-label"?: string;
}) {
  const selected = options.find((item) => item.id === value);
  const [query, setQuery] = useState("");
  const normalized = query.trim().toLocaleLowerCase("pt-BR");

  const filtered = useMemo(() => {
    const base = !normalized
      ? options
      : options.filter((item) => {
          const hay = `${item.label} ${item.keywords ?? ""}`.toLocaleLowerCase("pt-BR");
          return hay.includes(normalized);
        });
    const list = base.slice(0, limit);
    if (selected && !list.some((item) => item.id === selected.id)) {
      return [selected, ...list].slice(0, limit + 1);
    }
    return list;
  }, [limit, normalized, options, selected]);

  return (
    <div className="space-y-2">
      <input
        id={id}
        className={fieldClass}
        value={query}
        disabled={disabled}
        placeholder={placeholder}
        aria-label={ariaLabel ?? placeholder}
        onChange={(event) => setQuery(event.target.value)}
        autoComplete="off"
      />
      <select
        className={fieldClass}
        value={value}
        required={required}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="">Selecione</option>
        {filtered.map((item) => (
          <option key={item.id} value={item.id}>
            {item.label}
          </option>
        ))}
      </select>
      {normalized && filtered.length === 0 ? (
        <span className="block text-xs text-lotus-600">{emptyLabel}</span>
      ) : null}
      {selected && !normalized ? (
        <span className="block text-xs text-lotus-600">Selecionado: {selected.label}</span>
      ) : null}
    </div>
  );
}
