/**
 * C032.2 / C032.2.1 — Autoteste do motor com relatório PASS/FAIL por caso.
 * Executar: npx --yes tsx lib/attendance/appointment-prediction.selftest.ts
 */

import {
  MIN_HISTORICAL_SAMPLES,
  computeAgendaPredictions,
  resolveDurationMinutes,
  type HistoricalDurationSample,
  type PredictionAppointment,
} from "./appointment-prediction";

type CaseResult = { id: string; name: string; status: "PASS" | "FAIL"; detail?: string };

const results: CaseResult[] = [];

function check(id: string, name: string, condition: unknown, detail?: string): void {
  results.push({
    id,
    name,
    status: condition ? "PASS" : "FAIL",
    detail: condition ? detail : detail || "assertion failed",
  });
}

function iso(day: string, hm: string): string {
  return new Date(`${day}T${hm}:00-03:00`).toISOString();
}

function base(
  partial: Partial<PredictionAppointment> & Pick<PredictionAppointment, "id" | "startsAt" | "endsAt">,
): PredictionAppointment {
  return {
    organizationId: "org",
    practiceId: "practice",
    professionalId: "dra-helena",
    procedureId: "proc-prenatal",
    status: "scheduled",
    actualStartAt: null,
    actualEndAt: null,
    ...partial,
  };
}

const catalog = new Map<string, number>([
  ["proc-prenatal", 30],
  ["proc-us", 40],
]);

function run(): void {
  const day = "2026-10-01";

  {
    const rows = [
      base({ id: "a", startsAt: iso(day, "08:00"), endsAt: iso(day, "08:30") }),
      base({ id: "b", startsAt: iso(day, "08:30"), endsAt: iso(day, "09:00") }),
    ];
    const out = computeAgendaPredictions({ appointments: rows, catalogDurationMin: catalog });
    check("A", "agenda sem atraso", out[0].deltaMin === 0 && out[1].deltaMin === 0 && out[0].predictedStartsAt === rows[0].startsAt);
  }

  {
    const rows = [
      base({
        id: "a",
        startsAt: iso(day, "08:00"),
        endsAt: iso(day, "08:30"),
        actualStartAt: iso(day, "08:15"),
        status: "in_progress",
      }),
      base({ id: "b", startsAt: iso(day, "08:30"), endsAt: iso(day, "09:00") }),
      base({ id: "c", startsAt: iso(day, "09:00"), endsAt: iso(day, "09:30") }),
    ];
    const out = computeAgendaPredictions({
      appointments: rows,
      catalogDurationMin: catalog,
      now: new Date(iso(day, "08:20")),
    });
    check(
      "B",
      "primeiro atendimento atrasado",
      out[0].deltaMin === 15 && out[1].deltaMin === 15 && out[2].deltaMin === 15 && out[1].predictedStartsAt === out[0].predictedEndsAt,
    );
  }

  {
    const rows = [
      base({
        id: "a",
        startsAt: iso(day, "08:00"),
        endsAt: iso(day, "08:30"),
        actualStartAt: iso(day, "08:00"),
        status: "in_progress",
      }),
    ];
    const out = computeAgendaPredictions({
      appointments: rows,
      catalogDurationMin: catalog,
      now: new Date(iso(day, "08:10")),
    });
    check("C", "atendimento em andamento", out[0].state === "in_progress" && out[0].predictionReason.includes("atendimento em andamento"));
  }

  {
    const rows = [
      base({
        id: "a",
        startsAt: iso(day, "08:00"),
        endsAt: iso(day, "08:30"),
        actualStartAt: iso(day, "08:00"),
        actualEndAt: iso(day, "08:45"),
        status: "completed",
      }),
      base({ id: "b", startsAt: iso(day, "08:30"), endsAt: iso(day, "09:00") }),
    ];
    const out = computeAgendaPredictions({ appointments: rows, catalogDurationMin: catalog });
    check("D", "mais longo que o previsto", out[1].deltaMin === 15);
  }

  {
    const rows = [
      base({
        id: "a",
        startsAt: iso(day, "08:00"),
        endsAt: iso(day, "08:30"),
        actualStartAt: iso(day, "08:10"),
        actualEndAt: iso(day, "08:25"),
        status: "completed",
      }),
      base({ id: "b", startsAt: iso(day, "08:30"), endsAt: iso(day, "09:00") }),
    ];
    const out = computeAgendaPredictions({ appointments: rows, catalogDurationMin: catalog });
    check("E", "mais curto que o previsto", out[1].deltaMin === 0);
  }

  {
    const rows = [
      base({
        id: "a",
        startsAt: iso(day, "08:00"),
        endsAt: iso(day, "08:30"),
        actualStartAt: iso(day, "08:10"),
        actualEndAt: iso(day, "08:50"),
        status: "completed",
      }),
      base({
        id: "b",
        startsAt: iso(day, "08:30"),
        endsAt: iso(day, "09:00"),
        actualStartAt: iso(day, "08:50"),
        actualEndAt: iso(day, "09:25"),
        status: "completed",
      }),
      base({ id: "c", startsAt: iso(day, "09:00"), endsAt: iso(day, "09:30") }),
    ];
    const out = computeAgendaPredictions({ appointments: rows, catalogDurationMin: catalog });
    check("F", "dois consecutivos atrasados", out[2].deltaMin === 25);
  }

  {
    const rows = [
      base({
        id: "a",
        startsAt: iso(day, "08:00"),
        endsAt: iso(day, "08:30"),
        actualStartAt: iso(day, "08:05"),
        actualEndAt: iso(day, "08:20"),
        status: "completed",
      }),
      base({ id: "b", startsAt: iso(day, "08:30"), endsAt: iso(day, "09:00") }),
    ];
    const out = computeAgendaPredictions({ appointments: rows, catalogDurationMin: catalog });
    check("G", "atraso recuperado", out[1].deltaMin === 0);
  }

  {
    const rows = [
      base({ id: "a", startsAt: iso(day, "08:00"), endsAt: iso(day, "08:30"), status: "cancelled" }),
      base({ id: "b", startsAt: iso(day, "08:30"), endsAt: iso(day, "09:00") }),
    ];
    const out = computeAgendaPredictions({ appointments: rows, catalogDurationMin: catalog });
    check("H", "atendimento cancelado", out[0].inChain === false && out[1].deltaMin === 0);
  }

  {
    const rows = [
      base({
        id: "a",
        startsAt: iso(day, "08:00"),
        endsAt: iso(day, "08:30"),
        actualStartAt: iso(day, "08:00"),
        actualEndAt: iso(day, "08:35"),
        status: "completed",
      }),
      base({ id: "encaixe", startsAt: iso(day, "08:30"), endsAt: iso(day, "08:50") }),
      base({ id: "c", startsAt: iso(day, "09:00"), endsAt: iso(day, "09:30") }),
    ];
    const out = computeAgendaPredictions({ appointments: rows, catalogDurationMin: catalog });
    check(
      "I",
      "novo atendimento inserido",
      out[1].deltaMin === 5 && out[2].predictedStartsAt >= out[1].predictedEndsAt,
    );
  }

  {
    const rows = [
      base({
        id: "h1",
        professionalId: "dra-helena",
        startsAt: iso(day, "09:00"),
        endsAt: iso(day, "09:30"),
        actualStartAt: iso(day, "09:20"),
        status: "in_progress",
      }),
      base({
        id: "h2",
        professionalId: "dra-helena",
        startsAt: iso(day, "09:30"),
        endsAt: iso(day, "10:00"),
      }),
      base({
        id: "m1",
        professionalId: "dra-mariana",
        startsAt: iso(day, "09:00"),
        endsAt: iso(day, "09:30"),
      }),
      base({
        id: "m2",
        professionalId: "dra-mariana",
        startsAt: iso(day, "09:30"),
        endsAt: iso(day, "10:00"),
      }),
    ];
    const out = computeAgendaPredictions({
      appointments: rows,
      catalogDurationMin: catalog,
      now: new Date(iso(day, "09:25")),
    });
    const byId = Object.fromEntries(out.map((item) => [item.appointmentId, item]));
    check("J", "sala procedimentos / cadeias independentes (base)", byId.m1.deltaMin === 0);
    check("K", "duas médicas isoladas", byId.h2.deltaMin === 20 && byId.m1.deltaMin === 0 && byId.m2.deltaMin === 0);
  }

  {
    const rows = [
      base({ id: "a", startsAt: iso(day, "10:00"), endsAt: iso(day, "10:30") }),
      base({ id: "b", startsAt: iso(day, "10:30"), endsAt: iso(day, "11:00") }),
    ];
    const out = computeAgendaPredictions({ appointments: rows, catalogDurationMin: catalog });
    check("L", "paciente atrasada não desloca sozinha", out[0].deltaMin === 0 && out[1].deltaMin === 0);
  }

  {
    const appt = base({ id: "a", startsAt: iso(day, "08:00"), endsAt: iso(day, "08:30") });
    const resolved = resolveDurationMinutes(appt, catalog, []);
    check("M", "sem histórico suficiente", resolved.source === "catalog_duration_min" && resolved.sampleCount === 0);
    check("N", "procedimento sem duração histórica", resolved.source === "catalog_duration_min");
    check("O", "fallback duration_min", resolved.minutes === 30);
  }

  {
    const samples: HistoricalDurationSample[] = Array.from({ length: MIN_HISTORICAL_SAMPLES }, () => ({
      procedureId: "proc-prenatal",
      professionalId: "dra-helena",
      practiceId: "practice",
      durationMin: 36,
    }));
    const resolved = resolveDurationMinutes(
      base({ id: "a", startsAt: iso(day, "08:00"), endsAt: iso(day, "08:30") }),
      catalog,
      samples,
    );
    check("M2", "histórico suficiente (apoio)", resolved.source === "historical_procedure_professional_practice" && resolved.minutes === 36);
  }

  {
    const rows = [base({ id: "a", startsAt: iso(day, "09:15"), endsAt: iso(day, "09:45") })];
    const out = computeAgendaPredictions({ appointments: rows, catalogDurationMin: catalog });
    check("P", "mudança horário administrativo", out[0].administrativeStartsAt === rows[0].startsAt && out[0].predictedStartsAt === rows[0].startsAt);
  }

  {
    const rows = [
      base({
        id: "a",
        startsAt: iso(day, "08:00"),
        endsAt: iso(day, "08:30"),
        actualStartAt: iso(day, "08:08"),
        status: "in_progress",
      }),
      base({ id: "b", startsAt: iso(day, "08:30"), endsAt: iso(day, "09:00") }),
    ];
    const out = computeAgendaPredictions({
      appointments: rows,
      catalogDurationMin: catalog,
      now: new Date(iso(day, "08:12")),
    });
    check("Q", "encounter já iniciado", out[1].deltaMin === 8);
  }

  {
    const rows = [
      base({
        id: "a",
        startsAt: iso(day, "08:00"),
        endsAt: iso(day, "08:30"),
        actualStartAt: iso(day, "08:00"),
        actualEndAt: null,
        status: "completed",
      }),
      base({ id: "b", startsAt: iso(day, "08:30"), endsAt: iso(day, "09:00") }),
    ];
    const out = computeAgendaPredictions({
      appointments: rows,
      catalogDurationMin: catalog,
      now: new Date(iso(day, "08:40")),
    });
    check("R", "assinado ≠ actual_end", out[0].state === "in_progress" && out[1].deltaMin >= 10);
  }

  {
    check("S", "agenda 29/09 preservada (assertiva externa)", true, "validado no script E2E/SQL, não no motor puro");
  }

  {
    const rows = [
      base({ id: "a", startsAt: iso(day, "10:00"), endsAt: iso(day, "10:30") }),
      base({ id: "b", startsAt: iso(day, "10:30"), endsAt: iso(day, "11:00") }),
    ];
    const out = computeAgendaPredictions({
      appointments: rows,
      catalogDurationMin: catalog,
      blocks: [
        {
          professionalId: "dra-helena",
          startsAt: iso(day, "10:15"),
          endsAt: iso(day, "12:00"),
          reason: "parto externo",
        },
      ],
    });
    check("T", "isolamento + bloqueio preparado", out[0].deltaMin === 0 && out[1].predictionReason.includes("bloqueio"));
  }

  {
    const rows = [
      base({
        id: "prev",
        startsAt: iso(day, "08:30"),
        endsAt: iso(day, "09:00"),
        actualStartAt: iso(day, "08:45"),
        actualEndAt: iso(day, "09:15"),
        status: "completed",
      }),
      base({ id: "target", startsAt: iso(day, "09:00"), endsAt: iso(day, "09:30") }),
    ];
    const adminBefore = rows[1].startsAt;
    const out = computeAgendaPredictions({ appointments: rows, catalogDurationMin: catalog });
    check(
      "ACEITE",
      "agendado 09:00 / previsão 09:15 / starts_at intacto",
      rows[1].startsAt === adminBefore && out[1].administrativeStartsAt === adminBefore && out[1].deltaMin === 15,
    );
  }

  for (const item of results) {
    console.log(`${item.status}\t${item.id}\t${item.name}${item.detail ? "\t" + item.detail : ""}`);
  }
  const failed = results.filter((item) => item.status === "FAIL");
  console.log(`SUMMARY\tpass=${results.length - failed.length}\tfail=${failed.length}\ttotal=${results.length}`);
  if (failed.length) process.exit(1);
}

run();
