"use client";

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { Search } from "lucide-react";
import { fieldClass } from "@/components/platform/Ui";

export type EntityComboboxOption = {
  id: string;
  label: string;
  description?: string;
  keywords?: string;
};

export type EntityComboboxSearchFn = (
  query: string,
) => Promise<EntityComboboxOption[]> | EntityComboboxOption[];

/**
 * C070-C3 — autocomplete reutilizável.
 * - Modo local: filtra `options` já carregadas (listas pequenas).
 * - Modo remoto: `onSearch` consulta o banco com debounce / minChars.
 */
export function EntityCombobox({
  options,
  onSearch,
  value,
  onChange,
  placeholder = "Digite para pesquisar…",
  emptyLabel = "Nenhum registro encontrado.",
  errorLabel = "Não foi possível realizar a pesquisa. Tente novamente.",
  minCharsHint = "Digite ao menos {n} caracteres.",
  required = false,
  disabled = false,
  limit = 40,
  minChars = 0,
  debounceMs = 280,
  selectedLabel,
  /** CTA opcional quando não há resultado (ex.: cadastrar) — só se a tela já tiver a ação. */
  emptyAction = null,
  id,
  "aria-label": ariaLabel,
}: {
  options?: EntityComboboxOption[];
  /** Quando informado, prioriza busca remota (debounce + minChars). */
  onSearch?: EntityComboboxSearchFn;
  value: string;
  onChange: (id: string, option?: EntityComboboxOption | null) => void;
  placeholder?: string;
  emptyLabel?: string;
  errorLabel?: string;
  minCharsHint?: string;
  required?: boolean;
  disabled?: boolean;
  limit?: number;
  /** 0 = busca desde o primeiro caractere (ou lista local). Remoto: tipicamente 2. */
  minChars?: number;
  debounceMs?: number;
  /** Rótulo do valor já selecionado quando ainda não está em `options`/resultados. */
  selectedLabel?: string;
  emptyAction?: ReactNode;
  id?: string;
  "aria-label"?: string;
}) {
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [remoteOptions, setRemoteOptions] = useState<EntityComboboxOption[]>([]);
  const [busy, setBusy] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [highlight, setHighlight] = useState(0);
  const [pickedLabel, setPickedLabel] = useState<string | null>(selectedLabel ?? null);

  const remote = typeof onSearch === "function";
  const staticOptions = options ?? [];

  useEffect(() => {
    if (selectedLabel) setPickedLabel(selectedLabel);
  }, [selectedLabel]);

  useEffect(() => {
    const t = window.setTimeout(() => setDebounced(query.trim()), remote ? debounceMs : 0);
    return () => window.clearTimeout(t);
  }, [debounceMs, query, remote]);

  useEffect(() => {
    if (!remote || !onSearch) return;
    if (debounced.length < minChars) {
      setRemoteOptions([]);
      setSearchError(null);
      setBusy(false);
      return;
    }
    let cancelled = false;
    setBusy(true);
    void Promise.resolve(onSearch(debounced))
      .then((rows) => {
        if (cancelled) return;
        setRemoteOptions(rows.slice(0, limit));
        setSearchError(null);
        setHighlight(0);
      })
      .catch(() => {
        if (cancelled) return;
        setRemoteOptions([]);
        setSearchError(errorLabel);
      })
      .finally(() => {
        if (!cancelled) setBusy(false);
      });
    return () => {
      cancelled = true;
    };
  }, [debounced, errorLabel, limit, minChars, onSearch, remote]);

  const selectedFromStatic = useMemo(
    () => staticOptions.find((item) => item.id === value) ?? null,
    [staticOptions, value],
  );
  const selectedFromRemote = useMemo(
    () => remoteOptions.find((item) => item.id === value) ?? null,
    [remoteOptions, value],
  );
  const selected =
    selectedFromStatic ??
    selectedFromRemote ??
    (value && (pickedLabel || selectedLabel)
      ? { id: value, label: pickedLabel || selectedLabel || value }
      : null);

  const filteredLocal = useMemo(() => {
    if (remote) return [];
    const normalized = debounced.toLocaleLowerCase("pt-BR");
    const base = !normalized
      ? staticOptions
      : staticOptions.filter((item) => {
          const hay = `${item.label} ${item.description ?? ""} ${item.keywords ?? ""}`.toLocaleLowerCase(
            "pt-BR",
          );
          return hay.includes(normalized);
        });
    const list = base.slice(0, limit);
    if (selected && !list.some((item) => item.id === selected.id)) {
      return [selected, ...list].slice(0, limit + 1);
    }
    return list;
  }, [debounced, limit, remote, selected, staticOptions]);

  const visible = remote ? remoteOptions : filteredLocal;

  const statusMessage = useMemo(() => {
    if (searchError) return searchError;
    if (remote && query.trim().length > 0 && query.trim().length < minChars) {
      return minCharsHint.replace("{n}", String(minChars));
    }
    if (busy) return "Buscando…";
    if (open && debounced.length >= minChars && visible.length === 0 && !busy) {
      return emptyLabel;
    }
    return null;
  }, [
    busy,
    debounced.length,
    emptyLabel,
    minChars,
    minCharsHint,
    open,
    query,
    remote,
    searchError,
    visible.length,
  ]);

  const choose = useCallback(
    (option: EntityComboboxOption) => {
      setPickedLabel(option.label);
      setQuery("");
      setDebounced("");
      setOpen(false);
      onChange(option.id, option);
      inputRef.current?.blur();
    },
    [onChange],
  );

  const clear = useCallback(() => {
    setPickedLabel(null);
    setQuery("");
    setDebounced("");
    setRemoteOptions([]);
    onChange("", null);
    setOpen(false);
  }, [onChange]);

  useEffect(() => {
    function onDocPointer(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocPointer);
    return () => document.removeEventListener("mousedown", onDocPointer);
  }, []);

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      setOpen(false);
      setQuery("");
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setOpen(true);
      setHighlight((index) => Math.min(index + 1, Math.max(visible.length - 1, 0)));
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setHighlight((index) => Math.max(index - 1, 0));
      return;
    }
    if (event.key === "Enter" && open && visible[highlight]) {
      event.preventDefault();
      choose(visible[highlight]);
    }
  }

  const displayValue = open || query ? query : selected?.label ?? "";

  return (
    <div ref={rootRef} className="relative space-y-1" data-entity-combobox="true">
      <div className="relative">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-lotus-400"
          aria-hidden
        />
        <input
          ref={inputRef}
          id={id}
          className={`${fieldClass} pl-9`}
          value={displayValue}
          disabled={disabled}
          placeholder={placeholder}
          aria-label={ariaLabel ?? placeholder}
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls={listId}
          aria-activedescendant={
            open && visible[highlight] ? `${listId}-${visible[highlight].id}` : undefined
          }
          role="combobox"
          autoComplete="off"
          required={required && !value}
          onFocus={() => {
            setOpen(true);
            if (selected && !query) setQuery("");
          }}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
            if (value) {
              setPickedLabel(null);
              onChange("", null);
            }
          }}
          onKeyDown={onKeyDown}
        />
      </div>
      {/* Valor oculto para validação HTML de formulários nativos */}
      <input type="hidden" value={value} required={required} readOnly tabIndex={-1} />

      {open && !disabled ? (
        <ul
          id={listId}
          role="listbox"
          className="absolute z-40 mt-1 max-h-60 w-full overflow-auto rounded-xl border border-lotus-200 bg-white py-1 shadow-md"
        >
          {busy ? (
            <li className="px-3 py-2 text-xs text-lotus-600" role="presentation">
              Buscando…
            </li>
          ) : null}
          {!busy &&
            visible.map((item, index) => {
              const active = index === highlight;
              return (
                <li
                  key={item.id}
                  id={`${listId}-${item.id}`}
                  role="option"
                  aria-selected={item.id === value}
                  className={`cursor-pointer px-3 py-2 ${
                    active ? "bg-lotus-50" : "bg-white"
                  } ${item.id === value ? "font-semibold text-lotus-950" : "text-lotus-900"}`}
                  onMouseEnter={() => setHighlight(index)}
                  onMouseDown={(event) => {
                    event.preventDefault();
                    choose(item);
                  }}
                >
                  <span className="block text-sm">{item.label}</span>
                  {item.description ? (
                    <span className="mt-0.5 block text-xs font-normal text-lotus-600">
                      {item.description}
                    </span>
                  ) : null}
                </li>
              );
            })}
          {!busy && statusMessage && visible.length === 0 ? (
            <li className="px-3 py-2 text-xs text-lotus-600" role="presentation">
              {statusMessage}
              {emptyAction && statusMessage === emptyLabel ? (
                <div className="mt-2">{emptyAction}</div>
              ) : null}
            </li>
          ) : null}
        </ul>
      ) : null}

      {selected && !open ? (
        <div className="flex items-center justify-between gap-2">
          <span className="block text-xs text-lotus-600">Selecionado: {selected.label}</span>
          {!disabled ? (
            <button
              type="button"
              className="text-xs font-medium text-lotus-700 underline-offset-2 hover:underline"
              onClick={clear}
            >
              Limpar
            </button>
          ) : null}
        </div>
      ) : null}
      {searchError && !open ? (
        <span className="block text-xs text-rose-800">{searchError}</span>
      ) : null}
    </div>
  );
}
