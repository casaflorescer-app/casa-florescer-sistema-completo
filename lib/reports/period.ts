/** C062 — períodos de relatório (America/Sao_Paulo). */

export type PeriodPreset =
  | "today"
  | "yesterday"
  | "last_7"
  | "last_30"
  | "month_current"
  | "month_previous"
  | "year_current"
  | "custom";

export type ReportPeriod = {
  preset: PeriodPreset;
  /** Inclusive start as ISO date YYYY-MM-DD (calendário SP). */
  fromDate: string;
  /** Inclusive end as ISO date YYYY-MM-DD (calendário SP). */
  toDate: string;
};

export const PERIOD_PRESET_LABEL: Record<PeriodPreset, string> = {
  today: "Hoje",
  yesterday: "Ontem",
  last_7: "Últimos 7 dias",
  last_30: "Últimos 30 dias",
  month_current: "Mês atual",
  month_previous: "Mês anterior",
  year_current: "Ano atual",
  custom: "Personalizado",
};

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** Data civil atual em America/Sao_Paulo. */
export function todaySpDate(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function parseYmd(ymd: string): { y: number; m: number; d: number } {
  const [y, m, d] = ymd.split("-").map(Number);
  return { y, m, d };
}

function addDaysYmd(ymd: string, days: number): string {
  const { y, m, d } = parseYmd(ymd);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
}

function startOfMonth(ymd: string): string {
  const { y, m } = parseYmd(ymd);
  return `${y}-${pad(m)}-01`;
}

function endOfMonth(ymd: string): string {
  const { y, m } = parseYmd(ymd);
  const dt = new Date(Date.UTC(y, m, 0));
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
}

function previousMonthAnchor(ymd: string): string {
  const { y, m } = parseYmd(ymd);
  const dt = new Date(Date.UTC(y, m - 2, 1));
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-01`;
}

export function resolvePeriod(preset: PeriodPreset, customFrom?: string, customTo?: string): ReportPeriod {
  const today = todaySpDate();
  if (preset === "custom") {
    const fromDate = customFrom && customFrom <= (customTo || customFrom) ? customFrom : today;
    const toDate = customTo && customTo >= fromDate ? customTo : fromDate;
    return { preset, fromDate, toDate };
  }
  if (preset === "today") return { preset, fromDate: today, toDate: today };
  if (preset === "yesterday") {
    const y = addDaysYmd(today, -1);
    return { preset, fromDate: y, toDate: y };
  }
  if (preset === "last_7") {
    return { preset, fromDate: addDaysYmd(today, -6), toDate: today };
  }
  if (preset === "last_30") {
    return { preset, fromDate: addDaysYmd(today, -29), toDate: today };
  }
  if (preset === "month_current") {
    return { preset, fromDate: startOfMonth(today), toDate: today };
  }
  if (preset === "month_previous") {
    const anchor = previousMonthAnchor(today);
    return { preset, fromDate: startOfMonth(anchor), toDate: endOfMonth(anchor) };
  }
  // year_current
  const { y } = parseYmd(today);
  return { preset, fromDate: `${y}-01-01`, toDate: today };
}

/**
 * Converte data civil SP inclusiva em intervalo timestamptz [from, to).
 * Início = 00:00 SP do fromDate; fim = 00:00 SP do dia seguinte a toDate.
 */
export function periodToTimestamptzRange(period: ReportPeriod): { fromIso: string; toIso: string } {
  const fromIso = spMidnightToUtcIso(period.fromDate);
  const toExclusive = addDaysYmd(period.toDate, 1);
  const toIso = spMidnightToUtcIso(toExclusive);
  return { fromIso, toIso };
}

function spMidnightToUtcIso(ymd: string): string {
  // Constrói instante "ymd 00:00 America/Sao_Paulo" via offset aproximado:
  // usa Date com timezone fixo via Intl parts — fallback: append -03:00 (padrão Brasil sem DST desde 2019).
  return `${ymd}T00:00:00-03:00`;
}

export function formatPeriodLabel(period: ReportPeriod): string {
  const fmt = (ymd: string) => {
    const { d, m, y } = (() => {
      const [yy, mm, dd] = ymd.split("-");
      return { y: yy, m: mm, d: dd };
    })();
    return `${d}/${m}/${y}`;
  };
  return `${fmt(period.fromDate)} a ${fmt(period.toDate)}`;
}
