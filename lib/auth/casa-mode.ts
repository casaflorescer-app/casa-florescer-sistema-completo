/** Modo do browser. A produção fica desligada enquanto a variável não for exatamente "1". */
export function isCasaBrowserAuth(flag: string | undefined = process.env.NEXT_PUBLIC_CASA_AUTH) {
  return flag === "1";
}
