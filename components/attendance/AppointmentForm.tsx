"use client";

import { useState, type FormEvent } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAppointment } from "@/lib/attendance/directory";
import type { ProfessionalLabel } from "@/lib/pregnancies/directory";
import type { PatientListRow } from "@/lib/patients/directory";
import type { AppointmentKind } from "@/lib/types/database";
import { buttonClass, fieldClass, ghostButtonClass } from "@/components/platform/Ui";
import { APPOINTMENT_KIND_LABEL, localDateTimeIso } from "@/components/attendance/agenda-display";
import {
  singleOccupancyForProfessional,
  type RoomOccupancy,
} from "@/lib/clinic/room-occupancy";
import { encodeReturnOfNote } from "@/lib/attendance/return-link";
import { EntityCombobox } from "@/components/ui/EntityCombobox";

const labelClass = "text-sm font-medium text-lotus-800";

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
  patients,
  professionals,
  rooms,
  procedures,
  occupancy,
  busy,
  onBusy,
  onCreated,
  onCancel,
  initialPatientId = "",
  returnOfEncounterId = null,
}: {
  supabase: SupabaseClient;
  organizationId: string;
  practiceId: string;
  createdBy: string;
  defaultDate: string;
  patients: PatientListRow[];
  professionals: ProfessionalLabel[];
  rooms: AgendaRoomOption[];
  procedures: AgendaProcedureOption[];
  occupancy: RoomOccupancy[];
  busy: boolean;
  onBusy: (value: boolean) => void;
  onCreated: (message: string, bookedDate: string) => void;
  onCancel: () => void;
  /** C055 — pré-seleção ao agendar retorno. */
  initialPatientId?: string;
  returnOfEncounterId?: string | null;
}) {
  const [patientId, setPatientId] = useState(initialPatientId);
  const [professionalId, setProfessionalId] = useState("");
  const [roomId, setRoomId] = useState("");
  const [date, setDate] = useState(defaultDate);
  const [startsAt, setStartsAt] = useState("08:00");
  const [endsAt, setEndsAt] = useState("08:30");
  const [kind, setKind] = useState<AppointmentKind>("consultation");
  const [procedureId, setProcedureId] = useState("");
  const [urgencyNote, setUrgencyNote] = useState(
    returnOfEncounterId
      ? encodeReturnOfNote(returnOfEncounterId, "Retorno clínico")
      : "",
  );
  const [error, setError] = useState<string | null>(null);

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
      setError(result.error ?? "Não foi possível criar o agendamento.");
      return;
    }
    onCreated("Agendamento criado.", date);
  }

  const procedureRoom = rooms.filter((room) => room.roomKind === "procedure");
  const sharedProcedureRoom = procedureRoom.length === 1 ? procedureRoom[0] : undefined;

  function roomFor(nextKind: AppointmentKind, nextProfessionalId: string): string {
    if (nextKind === "procedure" && sharedProcedureRoom) return sharedProcedureRoom.id;
    const fixed = singleOccupancyForProfessional(occupancy, nextProfessionalId);
    const room = fixed ? rooms.find((item) => item.id === fixed.roomId) : undefined;
    return room?.id ?? "";
  }

  function chooseProfessional(nextProfessionalId: string) {
    setProfessionalId(nextProfessionalId);
    setRoomId(roomFor(kind, nextProfessionalId));
  }

  function chooseKind(nextKind: AppointmentKind) {
    setKind(nextKind);
    setRoomId(roomFor(nextKind, professionalId));
    if (nextKind === "consultation") {
      setProcedureId("");
    }
  }

  const suggested = singleOccupancyForProfessional(occupancy, professionalId);
  const suggestedRoom = suggested ? rooms.find((room) => room.id === suggested.roomId) : undefined;
  const blocked =
    patients.length === 0 ||
    professionals.length === 0 ||
    rooms.length === 0 ||
    (kind === "procedure" && procedures.length === 0);

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
      {patients.length === 0 ? (
        <p className="mt-4 text-sm text-lotus-700">Nenhuma paciente visível para agendar.</p>
      ) : null}
      {professionals.length === 0 ? (
        <p className="mt-4 text-sm text-lotus-700">Nenhuma profissional visível nesta prática.</p>
      ) : null}
      {rooms.length === 0 ? (
        <p className="mt-4 text-sm text-lotus-700">Nenhuma sala visível nesta organização.</p>
      ) : null}
      {procedures.length === 0 ? (
        <p className="mt-4 text-sm text-lotus-700">Nenhum procedimento visível nesta prática.</p>
      ) : null}

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <label className={labelClass}>
          Paciente
          <EntityCombobox
            value={patientId}
            onChange={setPatientId}
            required
            placeholder="Buscar paciente"
            options={patients.map((item) => ({
              id: item.id,
              label: item.fullName,
              keywords: item.cpf ?? undefined,
            }))}
          />
        </label>
        <label className={labelClass}>
          Profissional
          <EntityCombobox
            value={professionalId}
            onChange={chooseProfessional}
            required
            placeholder="Buscar profissional"
            options={professionals.map((item) => ({
              id: item.id,
              label: item.fullName,
            }))}
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
              onChange={setProcedureId}
              required
              placeholder="Buscar procedimento"
              emptyLabel="Nenhum procedimento encontrado."
              options={procedures.map((item) => ({
                id: item.id,
                label: item.name,
              }))}
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
            onChange={setRoomId}
            required
            placeholder="Buscar sala"
            options={rooms.map((item) => ({
              id: item.id,
              label: item.name,
              keywords: item.code,
            }))}
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

      <div className="mt-4 flex flex-wrap gap-3">
        <button type="submit" className={buttonClass} disabled={busy || blocked}>
          {busy ? "Salvando…" : "Salvar agendamento"}
        </button>
        <button type="button" className={ghostButtonClass} onClick={onCancel} disabled={busy}>
          Fechar
        </button>
      </div>
    </form>
  );
}
