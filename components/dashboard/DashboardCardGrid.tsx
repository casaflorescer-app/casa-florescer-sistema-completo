"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ChevronDown, ChevronUp, Eye, EyeOff } from "lucide-react";
import { ghostButtonClass } from "@/components/platform/Ui";
import {
  applyPanelPreferences,
  defaultPanelPreferences,
  loadPanelPreferences,
  resetPanelPreferences,
  savePanelPreferences,
  type PanelCardDef,
  type PanelPreferences,
} from "@/lib/dashboard/panel-preferences";

function DashCard({ card }: { card: PanelCardDef }) {
  const body = (
    <>
      <h3 className="font-semibold text-lotus-900">{card.title}</h3>
      <p className="mt-1 text-sm text-lotus-700">{card.note}</p>
    </>
  );
  if (!card.href) {
    return <article className="card">{body}</article>;
  }
  return (
    <Link href={card.href} className="card block transition-colors hover:border-lotus-200">
      {body}
    </Link>
  );
}

/**
 * Grade responsiva do Painel com organização por usuário (localStorage).
 */
export function DashboardCardGrid({
  userId,
  sectionId,
  cards,
  title,
}: {
  userId: string;
  /** Escopo de preferência (ex.: gestao, secretaria). */
  sectionId: string;
  cards: PanelCardDef[];
  title?: string;
}) {
  const scopeUserId = `${userId}:${sectionId}`;
  const cardIds = useMemo(() => cards.map((c) => c.id), [cards]);
  const [prefs, setPrefs] = useState<PanelPreferences>(() => defaultPanelPreferences(cardIds));
  const [organizing, setOrganizing] = useState(false);

  useEffect(() => {
    setPrefs(loadPanelPreferences(scopeUserId, cardIds));
  }, [scopeUserId, cardIds]);

  const persist = useCallback(
    (next: PanelPreferences) => {
      setPrefs(next);
      savePanelPreferences(scopeUserId, next);
    },
    [scopeUserId],
  );

  const visible = useMemo(() => applyPanelPreferences(cards, prefs), [cards, prefs]);

  function move(id: string, dir: -1 | 1) {
    const order = [...prefs.order];
    const idx = order.indexOf(id);
    if (idx < 0) return;
    const target = idx + dir;
    if (target < 0 || target >= order.length) return;
    const tmp = order[idx]!;
    order[idx] = order[target]!;
    order[target] = tmp;
    persist({ ...prefs, order });
  }

  function toggleHidden(id: string) {
    const hidden = prefs.hidden.includes(id)
      ? prefs.hidden.filter((x) => x !== id)
      : [...prefs.hidden, id];
    persist({ ...prefs, hidden });
  }

  function onReset() {
    resetPanelPreferences(scopeUserId);
    const next = defaultPanelPreferences(cardIds);
    setPrefs(next);
  }

  return (
    <section className="space-y-3" data-dashboard-grid={sectionId}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        {title ? (
          <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-lotus-500">
            {title}
          </h2>
        ) : (
          <span />
        )}
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className={ghostButtonClass}
            onClick={() => setOrganizing((v) => !v)}
          >
            {organizing ? "Concluir" : "Organizar painel"}
          </button>
          {organizing ? (
            <button type="button" className={ghostButtonClass} onClick={onReset}>
              Restaurar padrão
            </button>
          ) : null}
        </div>
      </div>

      {organizing ? (
        <ul className="space-y-2 rounded-2xl border border-lotus-100 bg-white p-3">
          {prefs.order.map((id) => {
            const card = cards.find((c) => c.id === id);
            if (!card) return null;
            const isHidden = prefs.hidden.includes(id);
            return (
              <li
                key={id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-lotus-50 px-3 py-2"
              >
                <div className="min-w-0">
                  <p className={`font-medium ${isHidden ? "text-lotus-400 line-through" : "text-lotus-900"}`}>
                    {card.title}
                  </p>
                  <p className="text-xs text-lotus-600">{card.note}</p>
                </div>
                <div className="flex shrink-0 gap-1">
                  <button
                    type="button"
                    className={ghostButtonClass}
                    aria-label={`Mover ${card.title} para cima`}
                    onClick={() => move(id, -1)}
                  >
                    <ChevronUp className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    className={ghostButtonClass}
                    aria-label={`Mover ${card.title} para baixo`}
                    onClick={() => move(id, 1)}
                  >
                    <ChevronDown className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    className={ghostButtonClass}
                    aria-label={isHidden ? `Mostrar ${card.title}` : `Ocultar ${card.title}`}
                    onClick={() => toggleHidden(id)}
                  >
                    {isHidden ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-2">{visible.map((card) => (
          <DashCard key={card.id} card={card} />
        ))}</div>
      )}
    </section>
  );
}
