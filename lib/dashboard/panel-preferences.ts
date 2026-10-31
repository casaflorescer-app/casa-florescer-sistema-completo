/**
 * Preferências do Painel por usuário (localStorage) — C070-C7.
 * Sem migration: ordem e ocultação ficam no browser.
 */

export type PanelCardDef = {
  id: string;
  title: string;
  note: string;
  href?: string;
};

export type PanelPreferences = {
  order: string[];
  hidden: string[];
};

const PREFIX = "cf.panel.prefs.v1:";

export function panelPrefsKey(userId: string): string {
  return `${PREFIX}${userId}`;
}

export function defaultPanelPreferences(cardIds: string[]): PanelPreferences {
  return { order: [...cardIds], hidden: [] };
}

export function loadPanelPreferences(
  userId: string,
  cardIds: string[],
): PanelPreferences {
  if (typeof window === "undefined" || !userId) {
    return defaultPanelPreferences(cardIds);
  }
  try {
    const raw = window.localStorage.getItem(panelPrefsKey(userId));
    if (!raw) return defaultPanelPreferences(cardIds);
    const parsed = JSON.parse(raw) as Partial<PanelPreferences>;
    const known = new Set(cardIds);
    const order = Array.isArray(parsed.order)
      ? parsed.order.filter((id): id is string => typeof id === "string" && known.has(id))
      : [];
    for (const id of cardIds) {
      if (!order.includes(id)) order.push(id);
    }
    const hidden = Array.isArray(parsed.hidden)
      ? parsed.hidden.filter((id): id is string => typeof id === "string" && known.has(id))
      : [];
    return { order, hidden };
  } catch {
    return defaultPanelPreferences(cardIds);
  }
}

export function savePanelPreferences(userId: string, prefs: PanelPreferences): void {
  if (typeof window === "undefined" || !userId) return;
  try {
    window.localStorage.setItem(panelPrefsKey(userId), JSON.stringify(prefs));
  } catch {
    /* quota / private mode */
  }
}

export function resetPanelPreferences(userId: string): void {
  if (typeof window === "undefined" || !userId) return;
  try {
    window.localStorage.removeItem(panelPrefsKey(userId));
  } catch {
    /* ignore */
  }
}

/** Aplica ordem e ocultação; cards desconhecidos no prefs são anexados. */
export function applyPanelPreferences(
  cards: PanelCardDef[],
  prefs: PanelPreferences,
): PanelCardDef[] {
  const byId = new Map(cards.map((c) => [c.id, c]));
  const hidden = new Set(prefs.hidden);
  const ordered: PanelCardDef[] = [];
  for (const id of prefs.order) {
    const card = byId.get(id);
    if (card && !hidden.has(id)) ordered.push(card);
    byId.delete(id);
  }
  for (const card of byId.values()) {
    if (!hidden.has(card.id)) ordered.push(card);
  }
  return ordered;
}
