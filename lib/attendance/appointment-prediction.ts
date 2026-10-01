/**
 * C032.2 — Motor de previsão dinâmica da agenda (camada pura).
 *
 * Regras obrigatórias:
 * - NÃO altera appointments.starts_at / ends_at
 * - NÃO altera appointments.scheduled_* 
 * - Previsão é camada separada (appointment_predictions / view model)
 * - arrival_at / checkin_at NÃO deslocam a cadeia sozinhos
 * - Cadeia por profissional (não mistura agendas)
 * - Bloqueios operacionais: preparados via AgendaBlockInterval (sem UI/módulo nesta etapa)
 *
 * Critério histórico:
 * MIN_HISTORICAL_SAMPLES = 5 observações com actual_start_at e actual_end_at
 * antes de usar média histórica. Sem dados suficientes → procedures.duration_min
 * (ou janela administrativa se não houver procedimento).
 */

export const MIN_HISTORICAL_SAMPLES = 5;

export type DurationSource =
  | "historical_procedure_professional_practice"
  | "historical_procedure_professional"
  | "historical_procedure_practice"
  | "catalog_duration_min"
  | "scheduled_window";

export type AgendaBlockInterval = {
  professionalId: string;
  startsAt: string;
  endsAt: string;
  /** Motivo interno futuro (parto externo, emergência). Não expor à paciente. */
  reason?: string | null;
};

export type PredictionAppointment = {
  id: string;
  organizationId: string;
  practiceId: string;
  professionalId: string;
  procedureId: string | null;
  /** Horário administrativo atual. */
  startsAt: string;
  endsAt: string;
  status: string;
  actualStartAt: string | null;
  actualEndAt: string | null;
};

export type HistoricalDurationSample = {
  procedureId: string;
  professionalId: string;
  practiceId: string;
  /** Minutos observados (actual_end - actual_start). */
  durationMin: number;
};

export type DurationResolution = {
  minutes: number;
  source: DurationSource;
  sampleCount: number;
};

export type AppointmentPredictionView = {
  appointmentId: string;
  organizationId: string;
  practiceId: string;
  /** Espelho do horário administrativo (starts_at). */
  administrativeStartsAt: string;
  administrativeEndsAt: string;
  predictedStartsAt: string;
  predictedEndsAt: string;
  /** predictedStartsAt - administrativeStartsAt, em minutos (inteiro). */
  deltaMin: number;
  estimatedDurationMin: number;
  durationSource: DurationSource;
  /** Texto interno para staff / appointment_predictions.prediction_reason. */
  predictionReason: string;
  inChain: boolean;
  state: "cancelled" | "no_show" | "completed_actual" | "in_progress" | "pending";
};

export type ComputeAgendaPredictionsInput = {
  appointments: PredictionAppointment[];
  /** procedureId → duration_min do catálogo. */
  catalogDurationMin: ReadonlyMap<string, number>;
  historicalSamples?: readonly HistoricalDurationSample[];
  /** Bloqueios futuros por profissional (C032.3). */
  blocks?: readonly AgendaBlockInterval[];
  /** Relógio operacional (testes / atendimento em andamento atrasado). */
  now?: Date;
};

function toMs(iso: string): number {
  return new Date(iso).getTime();
}

function addMinutesIso(iso: string, minutes: number): string {
  return new Date(toMs(iso) + minutes * 60_000).toISOString();
}

function diffMinutes(fromIso: string, toIso: string): number {
  return Math.round((toMs(toIso) - toMs(fromIso)) / 60_000);
}

function meanRounded(values: number[]): number {
  if (values.length === 0) return 0;
  const sum = values.reduce((acc, value) => acc + value, 0);
  return Math.max(1, Math.round(sum / values.length));
}

function scheduledWindowMinutes(appt: PredictionAppointment): number {
  const minutes = diffMinutes(appt.startsAt, appt.endsAt);
  return minutes > 0 ? minutes : 30;
}

/**
 * Resolve duração operacional com fallback progressivo.
 * Não inventa histórico: exige MIN_HISTORICAL_SAMPLES.
 */
export function resolveDurationMinutes(
  appt: PredictionAppointment,
  catalogDurationMin: ReadonlyMap<string, number>,
  historicalSamples: readonly HistoricalDurationSample[] = [],
): DurationResolution {
  const procedureId = appt.procedureId;
  if (!procedureId) {
    return {
      minutes: scheduledWindowMinutes(appt),
      source: "scheduled_window",
      sampleCount: 0,
    };
  }

  const usable = historicalSamples.filter(
    (sample) =>
      sample.procedureId === procedureId &&
      Number.isFinite(sample.durationMin) &&
      sample.durationMin > 0,
  );

  const byProfPractice = usable.filter(
    (sample) =>
      sample.professionalId === appt.professionalId &&
      sample.practiceId === appt.practiceId,
  );
  if (byProfPractice.length >= MIN_HISTORICAL_SAMPLES) {
    return {
      minutes: meanRounded(byProfPractice.map((s) => s.durationMin)),
      source: "historical_procedure_professional_practice",
      sampleCount: byProfPractice.length,
    };
  }

  const byProf = usable.filter((sample) => sample.professionalId === appt.professionalId);
  if (byProf.length >= MIN_HISTORICAL_SAMPLES) {
    return {
      minutes: meanRounded(byProf.map((s) => s.durationMin)),
      source: "historical_procedure_professional",
      sampleCount: byProf.length,
    };
  }

  const byPractice = usable.filter((sample) => sample.practiceId === appt.practiceId);
  if (byPractice.length >= MIN_HISTORICAL_SAMPLES) {
    return {
      minutes: meanRounded(byPractice.map((s) => s.durationMin)),
      source: "historical_procedure_practice",
      sampleCount: byPractice.length,
    };
  }

  const catalog = catalogDurationMin.get(procedureId);
  if (typeof catalog === "number" && catalog > 0) {
    return {
      minutes: Math.round(catalog),
      source: "catalog_duration_min",
      sampleCount: 0,
    };
  }

  return {
    minutes: scheduledWindowMinutes(appt),
    source: "scheduled_window",
    sampleCount: 0,
  };
}

function durationSourceLabel(source: DurationSource): string {
  switch (source) {
    case "historical_procedure_professional_practice":
      return "previsão baseada em duração histórica (procedimento+profissional+prática)";
    case "historical_procedure_professional":
      return "previsão baseada em duração histórica (procedimento+profissional)";
    case "historical_procedure_practice":
      return "previsão baseada em duração histórica (procedimento+prática)";
    case "catalog_duration_min":
      return "fallback para duration_min";
    case "scheduled_window":
      return "fallback para janela administrativa";
  }
}

/**
 * Empurra o início previsto para depois de bloqueios que intersectam
 * [earliest, earliest+duration) ou que cobrem o cursor da cadeia.
 */
function applyBlocks(
  professionalId: string,
  earliestIso: string,
  blocks: readonly AgendaBlockInterval[],
): { startIso: string; applied: AgendaBlockInterval | null } {
  let startMs = toMs(earliestIso);
  let applied: AgendaBlockInterval | null = null;
  const relevant = blocks
    .filter((block) => block.professionalId === professionalId)
    .slice()
    .sort((a, b) => toMs(a.startsAt) - toMs(b.startsAt));

  // Itera até estabilizar (bloqueios consecutivos).
  for (let guard = 0; guard < 16; guard += 1) {
    let moved = false;
    for (const block of relevant) {
      const blockStart = toMs(block.startsAt);
      const blockEnd = toMs(block.endsAt);
      if (!(blockEnd > blockStart)) continue;
      // Se o início previsto cai dentro do bloqueio, começa após o bloqueio.
      if (startMs >= blockStart && startMs < blockEnd) {
        startMs = blockEnd;
        applied = block;
        moved = true;
      }
    }
    if (!moved) break;
  }

  return { startIso: new Date(startMs).toISOString(), applied };
}

function isOutOfChain(status: string): boolean {
  return status === "cancelled" || status === "no_show";
}

/**
 * Calcula previsões em cadeia por profissional.
 * Entrada tipicamente = agenda do dia (já filtrada); histórico vem separado.
 */
export function computeAgendaPredictions(
  input: ComputeAgendaPredictionsInput,
): AppointmentPredictionView[] {
  const now = input.now ?? new Date();
  const nowIso = now.toISOString();
  const blocks = input.blocks ?? [];
  const historical = input.historicalSamples ?? [];
  const byProfessional = new Map<string, PredictionAppointment[]>();

  for (const appt of input.appointments) {
    const list = byProfessional.get(appt.professionalId) ?? [];
    list.push(appt);
    byProfessional.set(appt.professionalId, list);
  }

  const results: AppointmentPredictionView[] = [];

  for (const [, group] of byProfessional) {
    const ordered = group.slice().sort((a, b) => toMs(a.startsAt) - toMs(b.startsAt));
    /** Próximo instante em que a profissional fica livre (cadeia). */
    let cursorEndIso: string | null = null;

    for (const appt of ordered) {
      const duration = resolveDurationMinutes(appt, input.catalogDurationMin, historical);
      const adminStart = appt.startsAt;
      const adminEnd = appt.endsAt;

      if (isOutOfChain(appt.status)) {
        results.push({
          appointmentId: appt.id,
          organizationId: appt.organizationId,
          practiceId: appt.practiceId,
          administrativeStartsAt: adminStart,
          administrativeEndsAt: adminEnd,
          predictedStartsAt: adminStart,
          predictedEndsAt: adminEnd,
          deltaMin: 0,
          estimatedDurationMin: duration.minutes,
          durationSource: duration.source,
          predictionReason: `fora da cadeia (${appt.status}); ${durationSourceLabel(duration.source)}`,
          inChain: false,
          state: appt.status === "no_show" ? "no_show" : "cancelled",
        });
        continue;
      }

      if (appt.actualEndAt) {
        const start = appt.actualStartAt ?? adminStart;
        const end = appt.actualEndAt;
        cursorEndIso = end > start ? end : addMinutesIso(start, duration.minutes);
        results.push({
          appointmentId: appt.id,
          organizationId: appt.organizationId,
          practiceId: appt.practiceId,
          administrativeStartsAt: adminStart,
          administrativeEndsAt: adminEnd,
          predictedStartsAt: start,
          predictedEndsAt: cursorEndIso,
          deltaMin: diffMinutes(adminStart, start),
          estimatedDurationMin: Math.max(1, diffMinutes(start, cursorEndIso)),
          durationSource: duration.source,
          predictionReason: `recalculo após encerramento do atendimento; ${durationSourceLabel(duration.source)}`,
          inChain: true,
          state: "completed_actual",
        });
        continue;
      }

      if (appt.actualStartAt && !appt.actualEndAt) {
        const start = appt.actualStartAt;
        const estimatedEnd = addMinutesIso(start, duration.minutes);
        // Versão persistida permanece estável (start + duração).
        // A cadeia dos próximos usa max(estimado, agora) se o atendimento já passou do previsto.
        const chainEnd =
          toMs(nowIso) > toMs(estimatedEnd) ? nowIso : estimatedEnd;
        cursorEndIso = chainEnd;
        const delay = diffMinutes(adminStart, start);
        results.push({
          appointmentId: appt.id,
          organizationId: appt.organizationId,
          practiceId: appt.practiceId,
          administrativeStartsAt: adminStart,
          administrativeEndsAt: adminEnd,
          predictedStartsAt: start,
          predictedEndsAt: estimatedEnd,
          deltaMin: delay,
          estimatedDurationMin: duration.minutes,
          durationSource: duration.source,
          predictionReason:
            delay === 0
              ? `atendimento em andamento; ${durationSourceLabel(duration.source)}`
              : `atendimento em andamento; atraso de ${delay} minutos no início; ${durationSourceLabel(duration.source)}`,
          inChain: true,
          state: "in_progress",
        });
        continue;
      }

      // Ainda não iniciado: cadeia a partir do cursor (término previsto anterior).
      // Se o cursor termina antes do agendado, atraso recuperado → previsão = horário agendado.
      let earliest = adminStart;
      const reasonParts: string[] = [];

      if (cursorEndIso && toMs(cursorEndIso) > toMs(adminStart)) {
        earliest = cursorEndIso;
        reasonParts.push(
          `atraso de ${diffMinutes(adminStart, earliest)} minutos no atendimento anterior`,
        );
      }

      const blocked = applyBlocks(appt.professionalId, earliest, blocks);
      if (blocked.applied) {
        earliest = blocked.startIso;
        reasonParts.push("bloqueio operacional na cadeia");
      }

      const predictedStart = earliest;
      const predictedEnd = addMinutesIso(predictedStart, duration.minutes);
      cursorEndIso = predictedEnd;
      const deltaMin = diffMinutes(adminStart, predictedStart);

      if (reasonParts.length === 0) {
        reasonParts.push("sem atraso acumulado");
      }
      reasonParts.push(durationSourceLabel(duration.source));

      results.push({
        appointmentId: appt.id,
        organizationId: appt.organizationId,
        practiceId: appt.practiceId,
        administrativeStartsAt: adminStart,
        administrativeEndsAt: adminEnd,
        predictedStartsAt: predictedStart,
        predictedEndsAt: predictedEnd,
        deltaMin,
        estimatedDurationMin: duration.minutes,
        durationSource: duration.source,
        predictionReason: reasonParts.join("; "),
        inChain: true,
        state: "pending",
      });
    }
  }

  // Ordem estável = ordem administrativa da entrada.
  const order = new Map(input.appointments.map((appt, index) => [appt.id, index]));
  return results.sort(
    (a, b) => (order.get(a.appointmentId) ?? 0) - (order.get(b.appointmentId) ?? 0),
  );
}

export function formatPredictionDelta(deltaMin: number): {
  kind: "delay" | "early" | "on_time";
  label: string;
} {
  if (deltaMin > 0) return { kind: "delay", label: `+${deltaMin} min` };
  if (deltaMin < 0) return { kind: "early", label: `${deltaMin} min` };
  return { kind: "on_time", label: "no horário" };
}

export function durationSourceStaffLabel(source: DurationSource): string {
  switch (source) {
    case "historical_procedure_professional_practice":
      return "Histórico (procedimento + profissional + prática)";
    case "historical_procedure_professional":
      return "Histórico (procedimento + profissional)";
    case "historical_procedure_practice":
      return "Histórico (procedimento + prática)";
    case "catalog_duration_min":
      return "Catálogo (duration_min)";
    case "scheduled_window":
      return "Janela administrativa";
  }
}
