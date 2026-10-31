import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { getAuthUser } from "@/lib/auth/session";
import { isCasaDatabaseConfigured } from "@/lib/db/casa";
import { callCasaRpc } from "@/lib/casa/rpc";
import {
  getClinicalAssistanceProvider,
  type ClinicalSuggestionType,
} from "@/lib/ai/clinical-assistance-provider";

export const runtime = "nodejs";

const SUGGESTION_TYPES: ClinicalSuggestionType[] = [
  "summary",
  "anamnesis_organize",
  "soap",
  "missing_info",
  "followup_questions",
  "exam_suggestion",
  "treatment_hint",
];

function clip(value: unknown, max = 4000): string {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, max);
}

export async function POST(request: Request) {
  try {
    const supabase = await createServerSupabase();
    if (!supabase) {
      if (!isCasaDatabaseConfigured()) {
        return NextResponse.json({ error: "Autenticação indisponível." }, { status: 500 });
      }
      const user = await getAuthUser();
      if (!user) return NextResponse.json({ error: "NOT_AUTHENTICATED" }, { status: 401 });
      return casaClinicalAi(request);
    }

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "NOT_AUTHENTICATED" }, { status: 401 });
    }

    const body = (await request.json()) as {
      encounterId?: string;
      suggestionType?: string;
      organizationId?: string;
      practiceId?: string;
      patientId?: string;
      chiefComplaint?: string;
      anamnesis?: string;
      physicalExam?: string;
      soapDraft?: string;
      transcriptionExcerpt?: string;
      clinicalHistoryNotes?: string;
    };

    const encounterId = body.encounterId?.trim();
    const suggestionType = body.suggestionType?.trim() as ClinicalSuggestionType | undefined;
    if (!encounterId || !suggestionType || !SUGGESTION_TYPES.includes(suggestionType)) {
      return NextResponse.json({ error: "Parâmetros inválidos." }, { status: 400 });
    }

    const { data: requestRow, error: createError } = await supabase.rpc(
      "ai_assistance_request_create",
      {
        p_encounter_id: encounterId,
        p_suggestion_type: suggestionType,
        p_context_fingerprint: `${suggestionType}:${Date.now()}`,
      },
    );

    if (createError || !requestRow) {
      const message = createError?.message ?? "FORBIDDEN";
      const status =
        message.includes("FORBIDDEN") || message.includes("ENCOUNTER_OWNER")
          ? 403
          : message.includes("ENCOUNTER_NOT_OPEN")
            ? 409
            : 400;
      return NextResponse.json({ error: message }, { status });
    }

    const req = requestRow as {
      id: string;
      organization_id: string;
      practice_id: string;
      patient_id: string;
      encounter_id: string;
    };

    // Isolamento: IDs do body não podem divergir do encounter autenticado.
    if (
      (body.organizationId && body.organizationId !== req.organization_id) ||
      (body.practiceId && body.practiceId !== req.practice_id) ||
      (body.patientId && body.patientId !== req.patient_id) ||
      (body.encounterId && body.encounterId !== req.encounter_id)
    ) {
      await supabase.rpc("ai_assistance_save_result", {
        p_request_id: req.id,
        p_status: "failed",
        p_error_message: "Isolamento de prática/paciente falhou.",
      });
      return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
    }

    await supabase.rpc("ai_assistance_save_result", {
      p_request_id: req.id,
      p_status: "processing",
    });

    const provider = getClinicalAssistanceProvider();
    const result = await provider.suggest({
      organizationId: req.organization_id,
      practiceId: req.practice_id,
      patientId: req.patient_id,
      encounterId: req.encounter_id,
      suggestionType,
      chiefComplaint: clip(body.chiefComplaint, 2000),
      anamnesis: clip(body.anamnesis, 4000),
      physicalExam: clip(body.physicalExam, 3000),
      soapDraft: clip(body.soapDraft, 3000),
      transcriptionExcerpt: clip(body.transcriptionExcerpt, 4000),
      clinicalHistoryNotes: clip(body.clinicalHistoryNotes, 2000),
    });

    if (result.status === "unavailable") {
      await supabase.rpc("ai_assistance_save_result", {
        p_request_id: req.id,
        p_status: "unavailable",
        p_provider: result.provider,
        p_model: result.model,
        p_error_message: result.error ?? "Auxílio de IA indisponível.",
        p_is_simulation: false,
      });
      return NextResponse.json({
        status: "unavailable",
        error: "Auxílio de IA indisponível.",
        provider: result.provider,
        requestId: req.id,
      });
    }

    if (result.status !== "available" || !result.payload) {
      await supabase.rpc("ai_assistance_save_result", {
        p_request_id: req.id,
        p_status: "failed",
        p_provider: result.provider,
        p_model: result.model,
        p_error_message: result.error ?? "Falha na sugestão de IA.",
        p_is_simulation: result.isSimulation,
      });
      return NextResponse.json(
        {
          status: "failed",
          error: result.error ?? "Falha na sugestão de IA.",
          provider: result.provider,
          requestId: req.id,
        },
        { status: 422 },
      );
    }

    const { data: saved } = await supabase.rpc("ai_assistance_save_result", {
      p_request_id: req.id,
      p_status: "available",
      p_provider: result.provider,
      p_model: result.model,
      p_payload: result.payload,
      p_is_simulation: result.isSimulation,
    });

    return NextResponse.json({
      status: "available",
      requestId: req.id,
      result: saved,
      provider: result.provider,
      model: result.model,
      isSimulation: result.isSimulation,
      label: result.isSimulation
        ? "SIMULAÇÃO — Sugestão gerada por IA"
        : "Sugestão gerada por IA",
    });
  } catch {
    return NextResponse.json({ error: "Erro interno no auxílio de IA." }, { status: 500 });
  }
}

async function saveCasaResult(
  requestId: string,
  status: string,
  extra?: {
    provider?: string | null;
    model?: string | null;
    payload?: unknown;
    isSimulation?: boolean;
    error?: string | null;
  },
) {
  return callCasaRpc("ai_assistance_save_result", [
    requestId,
    status,
    extra?.provider ?? null,
    extra?.model ?? null,
    extra?.payload ?? {},
    extra?.isSimulation ?? false,
    extra?.error ?? null,
  ]);
}

async function casaClinicalAi(request: Request) {
  const body = (await request.json()) as {
    encounterId?: string;
    suggestionType?: string;
    organizationId?: string;
    practiceId?: string;
    patientId?: string;
    chiefComplaint?: string;
    anamnesis?: string;
    physicalExam?: string;
    soapDraft?: string;
    transcriptionExcerpt?: string;
    clinicalHistoryNotes?: string;
  };
  const encounterId = body.encounterId?.trim();
  const suggestionType = body.suggestionType?.trim() as ClinicalSuggestionType | undefined;
  if (!encounterId || !suggestionType || !SUGGESTION_TYPES.includes(suggestionType)) {
    return NextResponse.json({ error: "Parâmetros inválidos." }, { status: 400 });
  }
  let requestRow: unknown;
  try {
    requestRow = await callCasaRpc("ai_assistance_request_create", [
      encounterId,
      suggestionType,
      `${suggestionType}:${Date.now()}`,
    ]);
  } catch (error) {
    const message = error instanceof Error ? error.message : "FORBIDDEN";
    const status = message.includes("FORBIDDEN") || message.includes("ENCOUNTER_OWNER")
      ? 403
      : message.includes("ENCOUNTER_NOT_OPEN")
        ? 409
        : 400;
    return NextResponse.json({ error: message }, { status });
  }
  const req = requestRow as {
    id?: string;
    organization_id?: string;
    practice_id?: string;
    patient_id?: string;
    encounter_id?: string;
  };
  if (!req.id || !req.organization_id || !req.practice_id || !req.patient_id || !req.encounter_id) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }
  if (
    (body.organizationId && body.organizationId !== req.organization_id) ||
    (body.practiceId && body.practiceId !== req.practice_id) ||
    (body.patientId && body.patientId !== req.patient_id) ||
    body.encounterId !== req.encounter_id
  ) {
    await saveCasaResult(req.id, "failed", { error: "Isolamento de prática/paciente falhou." });
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }
  await saveCasaResult(req.id, "processing");
  const provider = getClinicalAssistanceProvider();
  const result = await provider.suggest({
    organizationId: req.organization_id,
    practiceId: req.practice_id,
    patientId: req.patient_id,
    encounterId: req.encounter_id,
    suggestionType,
    chiefComplaint: clip(body.chiefComplaint, 2000),
    anamnesis: clip(body.anamnesis, 4000),
    physicalExam: clip(body.physicalExam, 3000),
    soapDraft: clip(body.soapDraft, 3000),
    transcriptionExcerpt: clip(body.transcriptionExcerpt, 4000),
    clinicalHistoryNotes: clip(body.clinicalHistoryNotes, 2000),
  });
  if (result.status === "unavailable") {
    await saveCasaResult(req.id, "unavailable", {
      provider: result.provider,
      model: result.model,
      error: result.error ?? "Auxílio de IA indisponível.",
      isSimulation: false,
    });
    return NextResponse.json({
      status: "unavailable",
      error: "Auxílio de IA indisponível.",
      provider: result.provider,
      requestId: req.id,
    });
  }
  if (result.status !== "available" || !result.payload) {
    await saveCasaResult(req.id, "failed", {
      provider: result.provider,
      model: result.model,
      error: result.error ?? "Falha na sugestão de IA.",
      isSimulation: result.isSimulation,
    });
    return NextResponse.json(
      { status: "failed", error: result.error ?? "Falha na sugestão de IA.", provider: result.provider, requestId: req.id },
      { status: 422 },
    );
  }
  const saved = await saveCasaResult(req.id, "available", {
    provider: result.provider,
    model: result.model,
    payload: result.payload,
    isSimulation: result.isSimulation,
  });
  return NextResponse.json({
    status: "available",
    requestId: req.id,
    result: saved,
    provider: result.provider,
    model: result.model,
    isSimulation: result.isSimulation,
    label: result.isSimulation ? "SIMULAÇÃO — Sugestão gerada por IA" : "Sugestão gerada por IA",
  });
}
