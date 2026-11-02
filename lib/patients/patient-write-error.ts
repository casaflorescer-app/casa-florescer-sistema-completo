export const PATIENT_CPF_TAKEN = "Já existe um paciente cadastrado com este CPF.";

export function patientWriteError(err: unknown): unknown {
  const code =
    err && typeof err === "object" && "code" in err ? String((err as { code?: unknown }).code ?? "") : "";
  const message = err instanceof Error ? err.message : "";
  if (code === "23505" || /duplicate key|unique constraint/i.test(`${code} ${message}`)) {
    return new Error(PATIENT_CPF_TAKEN);
  }
  return err;
}
