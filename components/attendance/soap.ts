export type SoapNote = {
  subjective: string;
  objective: string;
  assessment: string;
  plan: string;
};

export const EMPTY_SOAP: SoapNote = {
  subjective: "",
  objective: "",
  assessment: "",
  plan: "",
};

export function soapHasContent(note: SoapNote): boolean {
  return [note.subjective, note.objective, note.assessment, note.plan].some(
    (item) => item.trim().length > 0,
  );
}

export function soapToBody(note: SoapNote): string {
  return JSON.stringify({
    subjective: note.subjective.trim(),
    objective: note.objective.trim(),
    assessment: note.assessment.trim(),
    plan: note.plan.trim(),
  });
}

export function soapFromBody(body: string | null | undefined): SoapNote {
  if (!body) return { ...EMPTY_SOAP };
  try {
    const parsed = JSON.parse(body) as Partial<SoapNote>;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return {
        subjective: typeof parsed.subjective === "string" ? parsed.subjective : "",
        objective: typeof parsed.objective === "string" ? parsed.objective : "",
        assessment: typeof parsed.assessment === "string" ? parsed.assessment : "",
        plan: typeof parsed.plan === "string" ? parsed.plan : "",
      };
    }
  } catch {
    return { ...EMPTY_SOAP, subjective: body };
  }
  return { ...EMPTY_SOAP, subjective: body };
}

export function sameSoap(left: SoapNote, right: SoapNote): boolean {
  return (
    left.subjective === right.subjective &&
    left.objective === right.objective &&
    left.assessment === right.assessment &&
    left.plan === right.plan
  );
}
