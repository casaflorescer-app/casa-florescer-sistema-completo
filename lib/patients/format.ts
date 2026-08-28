/** Cálculos de ficha GO: idade civil e DPP (Naegele). */

export function onlyDigits(value: string) {
  return value.replace(/\D/g, "");
}

export function isValidCpf(value: string) {
  const cpf = onlyDigits(value);
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;
  const nums = cpf.split("").map(Number);
  const digit = (base: number) => {
    const sum = nums.slice(0, base).reduce((acc, n, i) => acc + n * (base + 1 - i), 0);
    const mod = (sum * 10) % 11;
    return mod === 10 ? 0 : mod;
  };
  return digit(9) === nums[9] && digit(10) === nums[10];
}

export function formatCpf(value: string) {
  const d = onlyDigits(value).slice(0, 11);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`;
  if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

export function formatPhone(value: string) {
  const d = onlyDigits(value).slice(0, 11);
  if (d.length <= 2) return d.length ? `(${d}` : "";
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

export function formatCep(value: string) {
  const d = onlyDigits(value).slice(0, 8);
  if (d.length <= 5) return d;
  return `${d.slice(0, 5)}-${d.slice(5)}`;
}

export function ageFromBirthDate(isoDate: string, today = new Date()) {
  if (!isoDate) return null;
  const birth = new Date(`${isoDate}T00:00:00`);
  if (Number.isNaN(birth.getTime()) || birth > today) return null;
  let age = today.getFullYear() - birth.getFullYear();
  const month = today.getMonth() - birth.getMonth();
  if (month < 0 || (month === 0 && today.getDate() < birth.getDate())) age -= 1;
  return age;
}

/** DPP = DUM + 280 dias (regra de Naegele). */
export function eddFromLmp(lmpIso: string) {
  if (!lmpIso) return "";
  const lmp = new Date(`${lmpIso}T00:00:00`);
  if (Number.isNaN(lmp.getTime())) return "";
  lmp.setDate(lmp.getDate() + 280);
  const y = lmp.getFullYear();
  const m = String(lmp.getMonth() + 1).padStart(2, "0");
  const d = String(lmp.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export type GestationalAge = {
  weeks: number;
  days: number;
  totalDays: number;
};

/** Idade gestacional derivada (DUM → data de referência). Não persistir. */
export function gestationalAgeFromLmp(
  lmpIso: string,
  onDate = new Date(),
): GestationalAge | null {
  if (!lmpIso) return null;
  const lmp = new Date(`${lmpIso}T00:00:00`);
  if (Number.isNaN(lmp.getTime())) return null;
  const start = new Date(onDate.getFullYear(), onDate.getMonth(), onDate.getDate());
  const diffMs = start.getTime() - lmp.getTime();
  if (diffMs < 0) return null;
  const totalDays = Math.floor(diffMs / 86_400_000);
  return {
    weeks: Math.floor(totalDays / 7),
    days: totalDays % 7,
    totalDays,
  };
}

export function formatGestationalAge(lmpIso: string, onDate = new Date()) {
  const age = gestationalAgeFromLmp(lmpIso, onDate);
  if (!age) return "—";
  const weekLabel = age.weeks === 1 ? "semana" : "semanas";
  if (age.days === 0) return `${age.weeks} ${weekLabel}`;
  const dayLabel = age.days === 1 ? "dia" : "dias";
  return `${age.weeks} ${weekLabel} e ${age.days} ${dayLabel}`;
}

export function formatIsoDateBr(iso: string) {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  if (!y || !m || !d) return iso;
  return `${d}/${m}/${y}`;
}

export function gpaLabel(g: number, p: number, a: number) {
  return `G${g} P${p} A${a}`;
}
