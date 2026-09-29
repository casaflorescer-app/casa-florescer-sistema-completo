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
}) {
  const [patientId, setPatientId] = useState("");
  const [professionalId, setProfessionalId] = useState("");
  const [roomId, setRoomId] = useState("");
  const [date, setDate] = useState(defaultDate);
  const [startsAt, setStartsAt] = useState("08:00");
  const [endsAt, setEndsAt] = useState("08:30");
  const [kind, setKind] = useState<AppointmentKind>("consultation");
  const [procedureId, setProcedureId] = useState("");
  const [procedureQuery, setProcedureQuery] = useState("");
  const [urgencyNote, setUrgencyNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!patientId || !professionalId || !procedureId || !roomId) {
      setError("Informe paciente, profissional, procedimento e sala.");
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
      procedureId,
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
  }

  const query = procedureQuery.trim().toLocaleLowerCase("pt-BR");
  const visibleProcedures = [...procedures]
    .filter((item) => item.id === procedureId || item.name.toLocaleLowerCase("pt-BR").includes(query))
    .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  const suggested = singleOccupancyForProfessional(occupancy, professionalId);
  const suggestedRoom = suggested ? rooms.find((room) => room.id === suggested.roomId) : undefined;
  const blocked =
    patients.length === 0 || professionals.length === 0 || rooms.length === 0 || procedures.length === 0;

  return (
    <form className="card mt-6" onSubmit={(event) => void onSubmit(event)}>
      <h2 className="text-base font-semibold text-lotus-900">Novo atendimento</h2>
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
          <select
            className={fieldClass}
            value={patientId}
            onChange={(event) => setPatientId(event.target.value)}
            required
          >
            <option value="">Selecione</option>
            {patients.map((item) => (
              <option key={item.id} value={item.id}>
                {item.fullName}
              </option>
            ))}
          </select>
        </label>
        <label className={labelClass}>
          Profissional
          <select
            className={fieldClass}
            value={professionalId}
            onChange={(event) => chooseProfessional(event.target.value)}
            required
          >
            <option value="">Selecione</option>
            {professionals.map((item) => (
              <option key={item.id} value={item.id}>
                {item.fullName}
              </option>
            ))}
          </select>
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
        <label className={labelClass}>
          Procedimento
          <input
            className={fieldClass}
            value={procedureQuery}
            onChange={(event) => setProcedureQuery(event.target.value)}
            placeholder="Digite para pesquisar"
            aria-label="Pesquisar procedimento"
          />
          <select
            className={`${fieldClass} mt-2`}
            value={procedureId}
            onChange={(event) => setProcedureId(event.target.value)}
            required
          >
            <option value="">Selecione</option>
            {visibleProcedures.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </label>
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
          <select
            className={fieldClass}
            value={roomId}
            onChange={(event) => setRoomId(event.target.value)}
            required
          >
            <option value="">Selecione</option>
            {rooms.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
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
