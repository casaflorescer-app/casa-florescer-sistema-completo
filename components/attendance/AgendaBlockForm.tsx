"use client";

import { useCallback, useMemo, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ProfessionalLabel } from "@/lib/pregnancies/directory";
import {
  AGENDA_BLOCK_REASON_LABEL,
  createAgendaBlock,
  type AgendaBlockReasonCode,
  type AgendaBlockRow,
} from "@/lib/attendance/directory";
import type { AgendaRoomOption } from "@/components/attendance/AppointmentForm";
import { buttonClass } from "@/components/platform/Ui";
import { EntityCombobox } from "@/components/ui/EntityCombobox";
import { FormActions } from "@/components/ui/FormActions";
import type { EntitySearchOption } from "@/lib/search/entity-search";

const REASON_OPTIONS = Object.entries(AGENDA_BLOCK_REASON_LABEL) as Array<
  [AgendaBlockReasonCode, string]
>;

type Step = "form" | "confirm";

export function AgendaBlockForm({
  supabase,
  organizationId,
  practiceId,
  defaultDate,
  professionals,
  rooms,
  affectedPreviewCount,
  busy,
  onBusy,
  onCancel,
  onCreated,
}: {
  supabase: SupabaseClient;
  organizationId: string;
  practiceId: string;
  defaultDate: string;
  professionals: ProfessionalLabel[];
  rooms: AgendaRoomOption[];
  /** Contagem estimada após preview local (opcional). */
  affectedPreviewCount?: number | null;
  busy: boolean;
  onBusy: (busy: boolean) => void;
  onCancel: () => void;
  onCreated: (block: AgendaBlockRow, message: string) => void;
}) {
  const [step, setStep] = useState<Step>("form");
  const [professionalId, setProfessionalId] = useState("");
  const [professionalLabel, setProfessionalLabel] = useState("");
  const [roomId, setRoomId] = useState("");
  const [roomLabel, setRoomLabel] = useState("");
  const [date, setDate] = useState(defaultDate);
  const [startTime, setStartTime] = useState("10:00");
  const [endTime, setEndTime] = useState("14:30");
  const [reasonCode, setReasonCode] = useState<AgendaBlockReasonCode>("PARTO_HOSPITALAR");
  const [description, setDescription] = useState("Atendimento hospitalar emergencial");
  const [error, setError] = useState<string | null>(null);

  const startsAt = useMemo(() => toIsoLocal(date, startTime), [date, startTime]);
  const endsAt = useMemo(() => toIsoLocal(date, endTime), [date, endTime]);

  const professionalName = professionalLabel || "Profissional";

  const searchProfessionalsLocal = useCallback(
    async (query: string): Promise<EntitySearchOption[]> => {
      const q = query.trim().toLocaleLowerCase("pt-BR");
      return professionals
        .filter((item) => !q || item.fullName.toLocaleLowerCase("pt-BR").includes(q))
        .slice(0, 30)
        .map((item) => ({ id: item.id, label: item.fullName }));
    },
    [professionals],
  );

  const searchRoomsLocal = useCallback(
    async (query: string): Promise<EntitySearchOption[]> => {
      const q = query.trim().toLocaleLowerCase("pt-BR");
      return rooms
        .filter((item) => {
          if (!q) return true;
          const hay = `${item.name} ${item.code}`.toLocaleLowerCase("pt-BR");
          return hay.includes(q);
        })
        .slice(0, 30)
        .map((item) => ({
          id: item.id,
          label: item.code ? `${item.name} (${item.code})` : item.name,
        }));
    },
    [rooms],
  );

  async function onConfirm() {
    if (!startsAt || !endsAt) {
      setError("Informe data e horários válidos.");
      return;
    }
    if (!professionalId && !roomId) {
      setError("Informe profissional e/ou sala.");
      return;
    }
    onBusy(true);
    setError(null);
    try {
      const result = await createAgendaBlock(supabase, {
        organizationId,
        practiceId,
        professionalId: professionalId || null,
        roomId: roomId || null,
        startsAt,
        endsAt,
        reasonCode,
        title: AGENDA_BLOCK_REASON_LABEL[reasonCode],
        description,
      });
      if (result.error || !result.row) {
        setError(result.error ?? "Não foi possível criar o bloqueio.");
        setStep("form");
        return;
      }
      onCreated(
        result.row,
        "Bloqueio registrado. Horários administrativos preservados; previsões serão recalculadas.",
      );
    } finally {
      onBusy(false);
    }
  }

  if (step === "confirm") {
    return (
      <section className="mt-4 rounded-lg border border-amber-200 bg-amber-50/70 p-4">
        <h2 className="text-base font-semibold text-amber-950">Confirmar bloqueio</h2>
        <ul className="mt-3 space-y-1 text-sm text-amber-950">
          <li>
            Este bloqueio {affectedPreviewCount != null ? `afetará cerca de ${affectedPreviewCount}` : "poderá afetar"}{" "}
            atendimento(s).
          </li>
          <li>Os horários administrativos não serão alterados.</li>
          <li>As previsões dos atendimentos serão recalculadas.</li>
          <li>
            {professionalId ? professionalName : "Sala"} · {startTime}–{endTime} ·{" "}
            {AGENDA_BLOCK_REASON_LABEL[reasonCode]}
          </li>
        </ul>
        {error ? <p className="mt-3 text-sm text-red-700">{error}</p> : null}
        <div className="mt-4 flex flex-wrap gap-2">
          <button type="button" className={buttonClass} disabled={busy} onClick={() => setStep("form")}>
            Voltar
          </button>
          <button
            type="button"
            className={buttonClass}
            disabled={busy}
            onClick={() => void onConfirm()}
          >
            Confirmar bloqueio
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="mt-4 rounded-lg border border-lotus-200 bg-white p-4">
      <h2 className="text-base font-semibold text-lotus-900">Bloquear agenda</h2>
      <p className="mt-1 text-sm text-lotus-600">
        Registra indisponibilidade operacional. Não cancela nem move agendamentos.
      </p>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="font-medium text-lotus-700">Profissional</span>
          <div className="mt-1">
            <EntityCombobox
              value={professionalId}
              selectedLabel={professionalLabel}
              onChange={(id, option) => {
                setProfessionalId(id);
                setProfessionalLabel(option?.label ?? "");
              }}
              onSearch={searchProfessionalsLocal}
              minChars={0}
              placeholder="Nome do profissional…"
              emptyLabel="Nenhum profissional encontrado."
            />
          </div>
          <span className="mt-1 block text-xs text-lotus-500">Opcional se houver sala.</span>
        </label>

        <label className="block text-sm">
          <span className="font-medium text-lotus-700">Sala</span>
          <div className="mt-1">
            <EntityCombobox
              value={roomId}
              selectedLabel={roomLabel}
              onChange={(id, option) => {
                setRoomId(id);
                setRoomLabel(option?.label ?? "");
              }}
              onSearch={searchRoomsLocal}
              minChars={0}
              placeholder="Nome ou código da sala…"
              emptyLabel="Nenhuma sala encontrada."
            />
          </div>
          <span className="mt-1 block text-xs text-lotus-500">Opcional se houver profissional.</span>
        </label>

        <label className="block text-sm">
          <span className="font-medium text-lotus-700">Data</span>
          <input
            type="date"
            className="mt-1 w-full rounded-md border border-lotus-200 px-3 py-2"
            value={date}
            onChange={(event) => setDate(event.target.value)}
          />
        </label>

        <label className="block text-sm">
          <span className="font-medium text-lotus-700">Motivo</span>
          <select
            className="mt-1 w-full rounded-md border border-lotus-200 px-3 py-2"
            value={reasonCode}
            onChange={(event) => setReasonCode(event.target.value as AgendaBlockReasonCode)}
          >
            {REASON_OPTIONS.map(([code, label]) => (
              <option key={code} value={code}>
                {label}
              </option>
            ))}
          </select>
        </label>

        <label className="block text-sm">
          <span className="font-medium text-lotus-700">Início</span>
          <input
            type="time"
            className="mt-1 w-full rounded-md border border-lotus-200 px-3 py-2"
            value={startTime}
            onChange={(event) => setStartTime(event.target.value)}
          />
        </label>

        <label className="block text-sm">
          <span className="font-medium text-lotus-700">Fim estimado</span>
          <input
            type="time"
            className="mt-1 w-full rounded-md border border-lotus-200 px-3 py-2"
            value={endTime}
            onChange={(event) => setEndTime(event.target.value)}
          />
        </label>

        <label className="block text-sm sm:col-span-2">
          <span className="font-medium text-lotus-700">Observação operacional</span>
          <textarea
            className="mt-1 w-full rounded-md border border-lotus-200 px-3 py-2"
            rows={2}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
          />
        </label>
      </div>

      {error ? <p className="mt-3 text-sm text-red-700">{error}</p> : null}

      <FormActions
        primaryLabel="Bloquear agenda"
        primaryBusy={busy}
        onPrimary={() => {
          setError(null);
          if (!professionalId && !roomId) {
            setError("Informe profissional e/ou sala.");
            return;
          }
          if (!startsAt || !endsAt || endsAt <= startsAt) {
            setError("O fim estimado deve ser após o início.");
            return;
          }
          setStep("confirm");
        }}
        onCancel={onCancel}
      />
    </section>
  );
}

function toIsoLocal(date: string, time: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) return null;
  const value = new Date(`${date}T${time}:00`);
  if (Number.isNaN(value.getTime())) return null;
  return value.toISOString();
}
