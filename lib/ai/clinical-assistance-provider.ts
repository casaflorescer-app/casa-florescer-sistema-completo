/**
 * C040.4 — Auxílio clínico por IA.
 * Nunca grava no prontuário. Somente sugestão estruturada.
 *
 * CLINICAL_AI_ENABLED=false (padrão sem chave) → unavailable.
 * DevMock somente em desenvolvimento/teste, marcado como SIMULAÇÃO.
 */

export type ClinicalSuggestionType =
  | "summary"
  | "anamnesis_organize"
  | "soap"
  | "missing_info"
  | "followup_questions"
  | "exam_suggestion"
  | "treatment_hint";

export type ClinicalAiSoapSuggestion = {
  subjective: string;
  objective: string;
  assessment: string;
  plan: string;
};

export type ClinicalAiPayload = {
  summary: string;
  facts: string[];
  missing_information: string[];
  soap_suggestion: ClinicalAiSoapSuggestion;
  followup_questions: string[];
  exam_suggestions: string[];
  treatment_hints: string[];
  warnings: string[];
};

export type ClinicalAiResult = {
  status: "available" | "failed" | "unavailable";
  provider: string;
  model: string | null;
  isSimulation: boolean;
  payload: ClinicalAiPayload | null;
  error?: string;
};

export type ClinicalAiContext = {
  organizationId: string;
  practiceId: string;
  patientId: string;
  encounterId: string;
  suggestionType: ClinicalSuggestionType;
  chiefComplaint?: string;
  anamnesis?: string;
  physicalExam?: string;
  soapDraft?: string;
  transcriptionExcerpt?: string;
  clinicalHistoryNotes?: string;
};

const EMPTY_PAYLOAD: ClinicalAiPayload = {
  summary: "",
  facts: [],
  missing_information: [],
  soap_suggestion: { subjective: "", objective: "", assessment: "", plan: "" },
  followup_questions: [],
  exam_suggestions: [],
  treatment_hints: [],
  warnings: [],
};

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => asString(item)).filter(Boolean);
}

export function emptyClinicalAiPayload(): ClinicalAiPayload {
  return structuredClone(EMPTY_PAYLOAD);
}

export function validateClinicalAiPayload(raw: unknown): ClinicalAiPayload | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  const soapRaw =
    obj.soap_suggestion && typeof obj.soap_suggestion === "object"
      ? (obj.soap_suggestion as Record<string, unknown>)
      : {};

  const payload: ClinicalAiPayload = {
    summary: asString(obj.summary),
    facts: asStringArray(obj.facts),
    missing_information: asStringArray(obj.missing_information),
    soap_suggestion: {
      subjective: asString(soapRaw.subjective),
      objective: asString(soapRaw.objective),
      assessment: asString(soapRaw.assessment),
      plan: asString(soapRaw.plan),
    },
    followup_questions: asStringArray(obj.followup_questions),
    exam_suggestions: asStringArray(obj.exam_suggestions),
    treatment_hints: asStringArray(obj.treatment_hints),
    warnings: asStringArray(obj.warnings),
  };

  const hasContent =
    Boolean(payload.summary) ||
    payload.facts.length > 0 ||
    payload.missing_information.length > 0 ||
    Boolean(payload.soap_suggestion.subjective) ||
    Boolean(payload.soap_suggestion.objective) ||
    Boolean(payload.soap_suggestion.assessment) ||
    Boolean(payload.soap_suggestion.plan) ||
    payload.followup_questions.length > 0 ||
    payload.exam_suggestions.length > 0 ||
    payload.treatment_hints.length > 0;

  return hasContent ? payload : null;
}

export function isClinicalAiEnabled(): boolean {
  const flag = process.env.CLINICAL_AI_ENABLED?.trim().toLowerCase();
  if (flag === "false" || flag === "0" || flag === "off") return false;
  if (flag === "true" || flag === "1" || flag === "on") {
    return Boolean(process.env.OPENAI_API_KEY?.trim());
  }
  return Boolean(process.env.OPENAI_API_KEY?.trim());
}

function allowDevMock(): boolean {
  if (process.env.NODE_ENV === "production") return false;
  const flag = process.env.CLINICAL_AI_DEV_MOCK?.trim().toLowerCase();
  return flag === "true" || flag === "1" || flag === "on";
}

export interface ClinicalAssistanceProvider {
  readonly name: string;
  isEnabled(): boolean;
  suggest(context: ClinicalAiContext): Promise<ClinicalAiResult>;
}

export class UnavailableClinicalAssistanceProvider implements ClinicalAssistanceProvider {
  readonly name = "unavailable";
  isEnabled() {
    return false;
  }
  async suggest(): Promise<ClinicalAiResult> {
    return {
      status: "unavailable",
      provider: this.name,
      model: null,
      isSimulation: false,
      payload: null,
      error: "Auxílio de IA indisponível.",
    };
  }
}

export class DevMockClinicalAssistanceProvider implements ClinicalAssistanceProvider {
  readonly name = "dev-mock";
  isEnabled() {
    return allowDevMock();
  }
  async suggest(context: ClinicalAiContext): Promise<ClinicalAiResult> {
    const complaint = context.chiefComplaint?.trim() || "(não informado)";
    const payload = emptyClinicalAiPayload();
    payload.summary =
      `[SIMULAÇÃO] Resumo sugerido a partir do contexto disponível. Queixa/motivo: ${complaint}.`;
    payload.facts = [
      "Somente informações presentes no contexto do atendimento foram consideradas.",
      "Nenhum diagnóstico foi fechado automaticamente.",
    ];
    payload.missing_information = context.physicalExam?.trim()
      ? []
      : ["Exame físico pouco detalhado no contexto enviado."];
    payload.soap_suggestion = {
      subjective: context.chiefComplaint?.trim()
        ? `Paciente refere: ${context.chiefComplaint.trim()}`
        : "Subjetivo não detalhado no contexto enviado.",
      objective: context.physicalExam?.trim()
        ? context.physicalExam.trim().slice(0, 800)
        : "Objetivo não detalhado no contexto enviado.",
      assessment:
        "Avaliação clínica a critério da médica. IA não fecha diagnóstico.",
      plan: "Plano terapêutico a critério da médica. IA não prescrita.",
    };
    payload.followup_questions = [
      "Há sintomas associados não descritos?",
      "Houve mudanças desde a última consulta?",
    ];
    payload.warnings = [
      "SIMULAÇÃO — conteúdo gerado localmente para desenvolvimento/teste.",
      "Sugestão gerada por IA — revisão médica obrigatória.",
    ];
    if (context.suggestionType === "exam_suggestion") {
      payload.exam_suggestions = [
        "Sugestão de exames para avaliação — confirmação médica obrigatória.",
      ];
    }
    if (context.suggestionType === "treatment_hint") {
      payload.treatment_hints = [
        "Sugestão para revisão médica — não constitui prescrição.",
      ];
    }
    return {
      status: "available",
      provider: this.name,
      model: "dev-mock-c0404",
      isSimulation: true,
      payload,
    };
  }
}

const SYSTEM_PROMPT = `Você é um assistente de apoio clínico para médicas.
Regras obrigatórias:
- NÃO invente sintomas, sinais, diagnósticos, resultados de exames, medicamentos, doses, alergias, antecedentes ou dados obstétricos.
- Diferencie fato de inferência.
- Indique quando a informação não está disponível.
- NÃO diagnostique de forma autônoma.
- NÃO prescreva.
- NÃO crie resultado de exame.
- NÃO altere o prontuário.
- Produza SOMENTE sugestão para revisão médica.
- Responda APENAS com JSON válido no schema solicitado.
- Se o contexto for insuficiente, preencha missing_information e warnings.`;

export class OpenAIClinicalAssistanceProvider implements ClinicalAssistanceProvider {
  readonly name = "openai";
  isEnabled() {
    return Boolean(process.env.OPENAI_API_KEY?.trim());
  }

  async suggest(context: ClinicalAiContext): Promise<ClinicalAiResult> {
    const apiKey = process.env.OPENAI_API_KEY?.trim();
    if (!apiKey) {
      return {
        status: "unavailable",
        provider: this.name,
        model: null,
        isSimulation: false,
        payload: null,
        error: "Auxílio de IA indisponível.",
      };
    }

    const model = process.env.CLINICAL_AI_MODEL?.trim() || "gpt-4o-mini";
    const userContent = JSON.stringify({
      suggestion_type: context.suggestionType,
      organization_id: context.organizationId,
      practice_id: context.practiceId,
      patient_id: context.patientId,
      encounter_id: context.encounterId,
      chief_complaint: context.chiefComplaint ?? "",
      anamnesis: context.anamnesis ?? "",
      physical_exam: context.physicalExam ?? "",
      soap_draft: context.soapDraft ?? "",
      transcription_excerpt: context.transcriptionExcerpt ?? "",
      clinical_history_notes: context.clinicalHistoryNotes ?? "",
      output_schema: {
        summary: "string",
        facts: ["string"],
        missing_information: ["string"],
        soap_suggestion: {
          subjective: "string",
          objective: "string",
          assessment: "string",
          plan: "string",
        },
        followup_questions: ["string"],
        exam_suggestions: ["string"],
        treatment_hints: ["string"],
        warnings: ["string"],
      },
    });

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 45000);

    try {
      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        signal: controller.signal,
        body: JSON.stringify({
          model,
          temperature: 0.2,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: userContent },
          ],
        }),
      });

      if (response.status === 401 || response.status === 403) {
        return {
          status: "failed",
          provider: this.name,
          model,
          isSimulation: false,
          payload: null,
          error: "Falha de autenticação no provider de IA.",
        };
      }
      if (response.status === 429) {
        return {
          status: "failed",
          provider: this.name,
          model,
          isSimulation: false,
          payload: null,
          error: "Limite de uso do provider de IA.",
        };
      }
      if (!response.ok) {
        return {
          status: "failed",
          provider: this.name,
          model,
          isSimulation: false,
          payload: null,
          error: "Provider de IA indisponível.",
        };
      }

      const json = (await response.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const content = json.choices?.[0]?.message?.content;
      if (!content) {
        return {
          status: "failed",
          provider: this.name,
          model,
          isSimulation: false,
          payload: null,
          error: "Resposta inválida do provider de IA.",
        };
      }

      let parsed: unknown;
      try {
        parsed = JSON.parse(content);
      } catch {
        return {
          status: "failed",
          provider: this.name,
          model,
          isSimulation: false,
          payload: null,
          error: "Erro de parsing da resposta da IA.",
        };
      }

      const payload = validateClinicalAiPayload(parsed);
      if (!payload) {
        return {
          status: "failed",
          provider: this.name,
          model,
          isSimulation: false,
          payload: null,
          error: "Conteúdo incompleto ou inválido da IA.",
        };
      }

      if (!payload.warnings.some((w) => /sugestão/i.test(w))) {
        payload.warnings.push("Sugestão gerada por IA — revisão médica obrigatória.");
      }

      return {
        status: "available",
        provider: this.name,
        model,
        isSimulation: false,
        payload,
      };
    } catch (error) {
      const aborted =
        error instanceof Error &&
        (error.name === "AbortError" || /aborted/i.test(error.message));
      return {
        status: "failed",
        provider: this.name,
        model,
        isSimulation: false,
        payload: null,
        error: aborted ? "Timeout no provider de IA." : "Erro ao consultar o provider de IA.",
      };
    } finally {
      clearTimeout(timeout);
    }
  }
}

export function getClinicalAssistanceProvider(): ClinicalAssistanceProvider {
  if (isClinicalAiEnabled()) {
    return new OpenAIClinicalAssistanceProvider();
  }
  if (allowDevMock()) {
    return new DevMockClinicalAssistanceProvider();
  }
  return new UnavailableClinicalAssistanceProvider();
}
