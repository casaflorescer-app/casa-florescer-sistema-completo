/**
 * Prepara um argumento jsonb para `$n::jsonb`.
 * Objeto e array viram JSON textual uma vez. Texto que já é JSON válido
 * segue intacto. Null permanece null.
 */
export function serializeJsonbArgument(value: unknown): unknown {
  if (value == null) return value;
  if (typeof value === "string") {
    try {
      JSON.parse(value);
      return value;
    } catch {
      return JSON.stringify(value);
    }
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return JSON.stringify(value);
  }
  if (typeof value === "object") {
    return JSON.stringify(value);
  }
  return value;
}

export function bindCasaRpcArguments(args: unknown[], jsonbIndexes: readonly number[]): unknown[] {
  const slots = new Set(jsonbIndexes);
  return args.map((value, index) => (slots.has(index) ? serializeJsonbArgument(value) : value));
}

/** Erro de serialização ou de ligação com o banco. Não vai ao navegador. */
export function isInternalSqlError(message: string): boolean {
  return /invalid input syntax for type json|syntax error at or near|could not connect|connection terminated|ECONNREFUSED|set-valued function called/i.test(
    message,
  );
}
