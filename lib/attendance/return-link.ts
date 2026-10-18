/** C055 — marcação de retorno em agendamento (urgency_note) e helpers de vínculo. */

export const RETURN_OF_NOTE_PREFIX = "C055_RETURN_OF:" as const;

export function encodeReturnOfNote(sourceEncounterId: string, humanHint?: string): string {
  const id = sourceEncounterId.trim();
  const hint = humanHint?.trim();
  return hint
    ? `${RETURN_OF_NOTE_PREFIX}${id} | ${hint}`
    : `${RETURN_OF_NOTE_PREFIX}${id}`;
}

export function parseReturnOfNote(note: string | null | undefined): string | null {
  if (!note) return null;
  const trimmed = note.trim();
  if (!trimmed.startsWith(RETURN_OF_NOTE_PREFIX)) return null;
  const rest = trimmed.slice(RETURN_OF_NOTE_PREFIX.length).trim();
  const id = rest.split(/[\s|]/)[0]?.trim() ?? "";
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  return id;
}

export function agendaReturnHref(input: {
  patientId: string;
  sourceEncounterId: string;
}): string {
  const params = new URLSearchParams({
    patientId: input.patientId,
    returnOf: input.sourceEncounterId,
  });
  return `/app/agenda?${params.toString()}`;
}

export function encounterWorkspaceHref(encounterId: string, opts?: { fromReturn?: string }) {
  const params = new URLSearchParams();
  if (opts?.fromReturn) params.set("fromReturn", opts.fromReturn);
  const qs = params.toString();
  return qs ? `/app/records/${encounterId}?${qs}` : `/app/records/${encounterId}`;
}
