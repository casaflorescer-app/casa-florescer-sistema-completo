/** Normaliza texto só para comparação de busca — não altera o valor exibido nem o gravado. */
export function normalizeProcedureSearch(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLocaleLowerCase("pt-BR");
}

/**
 * Aceita substring no nome normalizado.
 * Também tolera 1 caractere extra na janela (ex.: "colo" → "colposcopia"),
 * sem ranking e sem alterar o catálogo.
 */
function matchesWithSingleGap(haystack: string, needle: string): boolean {
  if (needle.length < 3) return false;
  const maxSpan = needle.length + 1;
  for (let start = 0; start < haystack.length; start += 1) {
    let qi = 0;
    let end = start;
    for (let hi = start; hi < haystack.length && qi < needle.length; hi += 1) {
      if (haystack[hi] === needle[qi]) {
        qi += 1;
        end = hi;
        if (qi === needle.length) {
          if (end - start + 1 <= maxSpan) return true;
          break;
        }
      } else if (hi - start + 1 > maxSpan) {
        break;
      }
    }
  }
  return false;
}

export function procedureNameMatchesQuery(name: string, query: string): boolean {
  const normalizedQuery = normalizeProcedureSearch(query).trim();
  if (!normalizedQuery) return true;
  const normalizedName = normalizeProcedureSearch(name);
  if (normalizedName.includes(normalizedQuery)) return true;
  return matchesWithSingleGap(normalizedName, normalizedQuery);
}
