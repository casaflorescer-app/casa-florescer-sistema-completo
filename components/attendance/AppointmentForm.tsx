"use client";

import { useCallback, useState, type FormEvent } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAppointment } from "@/lib/attendance/directory";
import { isCasaBrowserAuth } from "@/lib/auth/casa-mode";
import { searchPatientsCasa } from "@/lib/casa/actions";
import type { ProfessionalLabel } from "@/lib/pregnancies/directory";
import type { AppointmentKind } from "@/lib/types/database";
import { fieldClass } from "@/components/platform/Ui";
import { FormActions } from "@/components/ui/FormActions";
import { friendlyError } from "@/lib/ui/friendly-error";
import { APPOINTMENT_KIND_LABEL, localDateTimeIso } from "@/components/attendance/agenda-display";
import {
  singleOccupancyForProfessional,
  type RoomOccupancy,
} from "@/lib/clinic/room-occupancy";
import { encodeReturnOfNote } from "@/lib/attendance/return-link";
import { EntityCombobox } from "@/components/ui/EntityCombobox";
import {
  patientToSearchOption,
  searchPatientOptions,
  searchProcedureOptions,
  searchProfessionalOptions,
  searchRoomOptions,
  type EntitySearchOption,
} from "@/lib/search/entity-search";

const labelClass = "text-sm font-medium text-lotus-800";

function matchLabels(items: { id: string; label: string }[], query: string): EntitySearchOption[] {
  const needle = query.trim().toLowerCase();
  if (needle.length < 2) return [];
  return items.filter((item) => item.label.toLowerCase().includes(needle)).slice(0, 30);
}

export type AgendaRoomOption = {
  id: string;
  name: string;
  code: string;
  roomKind?: string | null;
  isHouse?: boolean;
};

export type AgendaProcedureOption = {
  id: string;
  name: string;
};

export function AppointmentForm({
  supabase,
  organizationId,
  practiceId,
  createdBy,
  defaultDate,
  professionals,
  rooms,
  occupancy,
  busy,
  onBusy,
  onCreated,
  onCancel,
  initialPatientId = "",
  initialPatientLabel = "",
  returnOfEncounterId = null,
}: {
  supabase: SupabaseClient | null;
  organizationId: string;
  practiceId: string;
  createdBy: string;
  defaultDate: string;
  /** Lista leve para sugestão de sala (ocupação); busca remota cuida da seleção. */
  professionals: ProfessionalLabel[];
  rooms: AgendaRoomOption[];
  occupancy: RoomOccupancy[];
  busy: boolean;
  onBusy: (value: boolean) => void;
  onCreated: (message: string, bookedDate: string) => void;
  onCancel: () => void;
  /** C055 — pré-seleção ao agendar retorno. */
  initialPatientId?: string;
  initialPatientLabel?: string;
  returnOfEncounterId?: string | null;
}) {
  const [patientId, setPatientId] = useState(initialPatientId);
  const [patientLabel, setPatientLabel] = useState(initialPatientLabel);
  const [professionalId, setProfessionalId] = useState("");
  const [professionalLabel, setProfessionalLabel] = useState("");
  const [roomId, setRoomId] = useState("");
  const [roomLabel, setRoomLabel] = useState("");
  const [date, setDate] = useState(defaultDate);
  const [startsAt, setStartsAt] = useState("08:00");
  const [endsAt, setEndsAt] = useState("08:30");
  const [kind, setKind] = useState<AppointmentKind>("consultation");
  const [procedureId, setProcedureId] = useState("");
  const [procedureLabel, setProcedureLabel] = useState("");
  const [urgencyNote, setUrgencyNote] = useState(
    returnOfEncounterId
      ? encodeReturnOfNote(returnOfEncounterId, "Retorno clínico")
      : "",
  );
  const [error, setError] = useState<string | null>(null);

  const searchPatients = useCallback(
    async (query: string) => {
      if (!supabase) {
        if (!isCasaBrowserAuth()) return [];
        const rows = await searchPatientsCasa(query);
        return rows.slice(0, 30).map(patientToSearchOption);
      }
      return searchPatientOptions(supabase, query, { limit: 30 });
    },
    [supabase],
  );
  const searchProfessionals = useCallback(
    async (query: string): Promise<EntitySearchOption[]> => {
      if (!supabase) return matchLabels(professionals.map((item) => ({ id: item.id, label: item.fullName })), query);
      return searchProfessionalOptions(supabase, query, { practiceId, limit: 30 });
    },
    [practiceId, professionals, supabase],
  );
  const searchRooms = useCallback(
    async (query: string): Promise<EntitySearchOption[]> => {
      if (!supabase) return matchLabels(rooms.map((item) => ({ id: item.id, label: item.name })), query);
      return searchRoomOptions(supabase, query, { organizationId, limit: 40 });
    },
    [organizationId, rooms, supabase],
  );
  const searchProcedures = useCallback(
    async (query: string) => {
      if (!supabase) return [];
      return searchProcedureOptions(supabase, query, {
        organizationId,
        practiceId,
        limit: 30,
      });
    },
    [organizationId, practiceId, supabase],
  );

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!patientId || !professionalId || !roomId) {
      setError("Informe paciente, profissional e sala.");
      return;
    }
    if (kind === "procedure" && !procedureId) {
      setError("Informe o procedimento para este tipo de agendamento.");
      return;
    }
    const startIso = localDateTimeIso(date, startsAt);
    const endIso = localDateTimeIso(date, endsAt);
    if (!startIso || !endIso) {
      setError("Informe data e horários válidos.");
      return;
    }
    if (endIso <= startIso) {
      setError("O horário de término deve ser após o início.");
      return;
    }

    onBusy(true);
    setError(null);
    const result = await createAppointment(supabase, {
      organizationId,
      practiceId,
      roomId,
      patientId,
      professionalId,
      startsAt: startIso,
      endsAt: endIso,
      kind,
      procedureId: kind === "procedure" ? procedureId : null,
      urgencyNote: urgencyNote.trim() || null,
      createdBy,
    });
    onBusy(false);
    if (result.error || !result.row) {
      setError(
        friendlyError(result.error, "Não foi possível criar o agendamento. Tente novamente."),
      );
      return;
    }
    onCreated("Agendamento criado.", date);
  }

  const procedureRoom = rooms.filter((room) => room.roomKind === "procedure");
  const sharedProcedureRoom = procedureRoom.length === 1 ? procedureRoom[0] : undefined;

  function roomFor(nextKind: AppointmentKind, nextProfessionalId: string): {
    id: string;
    label: string;
  } {
    if (nextKind === "procedure" && sharedProcedureRoom) {
      return { id: sharedProcedureRoom.id, label: sharedProcedureRoom.name };
    }
    const fixed = singleOccupancyForProfessional(occupancy, nextProfessionalId);
    const room = fixed ? rooms.find((item) => item.id === fixed.roomId) : undefined;
    return room ? { id: room.id, label: room.name } : { id: "", label: "" };
  }

  function chooseProfessional(nextProfessionalId: string, label?: string) {
    setProfessionalId(nextProfessionalId);
    setProfessionalLabel(label ?? "");
    const next = roomFor(kind, nextProfessionalId);
    setRoomId(next.id);
    setRoomLabel(next.label);
  }

  function chooseKind(nextKind: AppointmentKind) {
    setKind(nextKind);
    const next = roomFor(nextKind, professionalId);
    setRoomId(next.id);
    setRoomLabel(next.label);
    if (nextKind === "consultation") {
      setProcedureId("");
      setProcedureLabel("");
    }
  }

  const suggested = singleOccupancyForProfessional(occupancy, professionalId);
  const suggestedRoom = suggested ? rooms.find((room) => room.id === suggested.roomId) : undefined;
  const blocked = !organizationId || !practiceId || professionals.length === 0 || rooms.length === 0;

  return (
    <form className="card mt-6" onSubmit={(event) => void onSubmit(event)}>
      <h2 className="text-base font-semibold text-lotus-900">
        {returnOfEncounterId ? "Agendar retorno" : "Novo atendimento"}
      </h2>
      {returnOfEncounterId ? (
        <p className="mt-1 text-sm text-lotus-700">
          Este compromisso será vinculado ao atendimento de origem ao abrir o retorno.
        </p>
      ) : null}
      <p className="mt-1 text-sm text-lotus-600">
        O agendamento entra como agendado. O atendimento médico começa depois do check-in.
      </p>

      {error ? (
        <p className="mt-4 text-sm text-rose-800" role="alert">
          {error}
        </p>
      ) : null}
      {professionals.length === 0 ? (
        <p className="mt-4 text-sm text-lotus-700">Nenhuma profissional visível nesta prática.</p>
      ) : null}
      {rooms.length === 0 ? (
        <p className="mt-4 text-sm text-lotus-700">Nenhuma sala visível nesta organização.</p>
      ) : null}

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <label className={labelClass}>
          Paciente
          <EntityCombobox
            value={patientId}
            selectedLabel={patientLabel}
            onChange={(id, option) => {
              setPatientId(id);
              setPatientLabel(option?.label ?? "");
            }}
            onSearch={searchPatients}
            minChars={2}
            required
            placeholder="Digite o nome, CPF ou telefone…"
            emptyLabel="Nenhum paciente encontrado."
          />
        </label>
        <label className={labelClass}>
          Profissional
          <EntityCombobox
            value={professionalId}
            selectedLabel={professionalLabel}
            onChange={(id, option) => chooseProfessional(id, option?.label)}
            onSearch={searchProfessionals}
            minChars={2}
            required
            placeholder="Nome, especialidade ou registro…"
            emptyLabel="Nenhum profissional encontrado."
          />
        </label>
        <label className={labelClass}>
          Tipo
          <select
            className={fieldClass}
            value={kind}
            onChange={(event) => chooseKind(event.target.value as AppointmentKind)}
          >
            <option value="consultation">{APPOINTMENT_KIND_LABEL.consultation}</option>
            <option value="procedure">{APPOINTMENT_KIND_LABEL.procedure}</option>
          </select>
        </label>
        {kind === "procedure" ? (
          <label className={labelClass}>
            Procedimento
            <EntityCombobox
              value={procedureId}
              selectedLabel={procedureLabel}
              onChange={(id, option) => {
                setProcedureId(id);
                setProcedureLabel(option?.label ?? "");
              }}
              onSearch={searchProcedures}
              minChars={2}
              required
              placeholder="Nome ou código do procedimento…"
              emptyLabel="Nenhum procedimento encontrado."
            />
          </label>
        ) : (
          <p className="text-sm text-lotus-600 sm:col-span-1">
            Consulta não exige procedimento cadastrado.
          </p>
        )}
        <label className={labelClass}>
          Data
          <input
            type="date"
            className={fieldClass}
            value={date}
            onChange={(event) => setDate(event.target.value)}
            required
          />
        </label>
        <label className={labelClass}>
          Hora inicial
          <input
            type="time"
            className={fieldClass}
            value={startsAt}
            onChange={(event) => setStartsAt(event.target.value)}
            required
          />
        </label>
        <label className={labelClass}>
          Hora final
          <input
            type="time"
            className={fieldClass}
            value={endsAt}
            onChange={(event) => setEndsAt(event.target.value)}
            required
          />
        </label>
        <label className={labelClass}>
          Sala
          <EntityCombobox
            value={roomId}
            selectedLabel={roomLabel}
            onChange={(id, option) => {
              setRoomId(id);
              setRoomLabel(option?.label ?? "");
            }}
            onSearch={searchRooms}
            minChars={1}
            required
            placeholder="Nome, código ou tipo de sala…"
            emptyLabel="Nenhuma sala encontrada."
          />
          {kind === "procedure" && sharedProcedureRoom && roomId === sharedProcedureRoom.id ? (
            <span className="mt-1 block text-xs font-normal normal-case tracking-normal text-lotus-600">
              Sala de procedimentos sugerida. O uso é compartilhado.
            </span>
          ) : null}
          {kind === "consultation" && suggestedRoom && roomId === suggestedRoom.id ? (
            <span className="mt-1 block text-xs font-normal normal-case tracking-normal text-lotus-600">
              Sala fixa sugerida. A sala de procedimentos continua disponível.
            </span>
          ) : null}
        </label>
        <label className={`${labelClass} sm:col-span-2`}>
          Observação
          <textarea
            className={fieldClass}
            rows={2}
            value={urgencyNote}
            onChange={(event) => setUrgencyNote(event.target.value)}
            placeholder="Nota de urgência, se houver"
          />
        </label>
      </div>

      <FormActions
        primaryLabel="Salvar agendamento"
        primaryBusy={busy}
        primaryDisabled={blocked}
        cancelLabel="Fechar"
        onCancel={onCancel}
      />
    </form>
  );
}
