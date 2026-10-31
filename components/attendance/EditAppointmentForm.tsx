"use client";

import { useState, type FormEvent } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { updateAppointment, type AppointmentRow } from "@/lib/attendance/directory";
import type { ProfessionalLabel } from "@/lib/pregnancies/directory";
import type { PatientListRow } from "@/lib/patients/directory";
import type { AppointmentKind } from "@/lib/types/database";
import { buttonClass, fieldClass, ghostButtonClass } from "@/components/platform/Ui";
import {
  APPOINTMENT_KIND_LABEL,
  formatClock,
  isoToInputDate,
  isoToInputTime,
  localDateTimeIso,
} from "@/components/attendance/agenda-display";
import {
  singleOccupancyForProfessional,
  type RoomOccupancy,
} from "@/lib/clinic/room-occupancy";
import type {
  AgendaProcedureOption,
  AgendaRoomOption,
} from "@/components/attendance/AppointmentForm";
import { EntityCombobox } from "@/components/ui/EntityCombobox";

const labelClass = "text-sm font-medium text-lotus-800";

export function EditAppointmentForm({
  supabase,
  appointment,
  patients,
  professionals,
  rooms,
  procedures,
  occupancy,
  busy,
  onBusy,
  onSaved,
  onCancel,
}: {
  supabase: SupabaseClient;
  appointment: AppointmentRow;
  patients: PatientListRow[];
  professionals: ProfessionalLabel[];
  rooms: AgendaRoomOption[];
  procedures: AgendaProcedureOption[];
  occupancy: RoomOccupancy[];
  busy: boolean;
  onBusy: (value: boolean) => void;
  onSaved: (message: string, bookedDate: string) => void;
  onCancel: () => void;
}) {
  const [patientId, setPatientId] = useState(appointment.patientId);
  const [professionalId, setProfessionalId] = useState(appointment.professionalId);
  const [roomId, setRoomId] = useState(appointment.roomId);
  const [date, setDate] = useState(isoToInputDate(appointment.startsAt));
  const [startsAt, setStartsAt] = useState(isoToInputTime(appointment.startsAt));
  const [endsAt, setEndsAt] = useState(isoToInputTime(appointment.endsAt));
  const [kind, setKind] = useState<AppointmentKind>(appointment.kind);
  const [procedureId, setProcedureId] = useState(appointment.procedureId ?? "");
  const [urgencyNote, setUrgencyNote] = useState(appointment.urgencyNote ?? "");
  const [error, setError] = useState<string | null>(null);

  const procedureRoom = rooms.filter((room) => room.roomKind === "procedure");
  const sharedProcedureRoom = procedureRoom.length === 1 ? procedureRoom[0] : undefined;

  function roomFor(nextKind: AppointmentKind, nextProfessionalId: string): string {
    if (nextKind === "procedure" && sharedProcedureRoom) return sharedProcedureRoom.id;
    const fixed = singleOccupancyForProfessional(occupancy, nextProfessionalId);
    const room = fixed ? rooms.find((item) => item.id === fixed.roomId) : undefined;
    return room?.id ?? roomId;
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

    const patientName =
      patients.find((item) => item.id === patientId)?.fullName ?? "Paciente";
    const professionalName =
      professionals.find((item) => item.id === professionalId)?.fullName ?? "Profissional";
    const procedureName =
      kind === "procedure"
        ? procedures.find((item) => item.id === procedureId)?.name ?? "Procedimento"
        : "— (consulta)";
    const roomName = rooms.find((item) => item.id === roomId)?.name ?? "Sala";
    const summary = [
      "Salvar alterações?",
      "",
      `Paciente: ${patientName}`,
      `Profissional: ${professionalName}`,
      `Procedimento: ${procedureName}`,
      `Data: ${date}`,
      `Horário: ${formatClock(startIso)}–${formatClock(endIso)}`,
      `Sala: ${roomName}`,
    ].join("\n");
    if (!window.confirm(summary)) return;

    onBusy(true);
    setError(null);
    const result = await updateAppointment(supabase, {
      appointmentId: appointment.id,
      patientId,
      professionalId,
      roomId,
      procedureId: kind === "procedure" ? procedureId : null,
      kind,
      startsAt: startIso,
      endsAt: endIso,
      urgencyNote: urgencyNote.trim() || null,
    });
    onBusy(false);
    if (result.error || !result.row) {
      setError(result.error ?? "Não foi possível salvar o agendamento.");
      return;
    }
    onSaved("Agendamento atualizado.", date);
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
      <h2 className="text-base font-semibold text-lotus-900">Editar agendamento</h2>
      <p className="mt-1 text-sm text-lotus-600">
        Altere os dados operacionais. O prontuário não é modificado por esta edição.
      </p>

      {error ? (
        <p className="mt-4 text-sm text-rose-800" role="alert">
          {error}
        </p>
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
          {kind === "consultation" && suggestedRoom && roomId && roomId !== suggestedRoom.id ? (
            <span className="mt-1 block text-xs font-normal normal-case tracking-normal text-lotus-600">
              Sala escolhida diferente da sugestão fixa.
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
          {busy ? "Salvando…" : "Salvar alterações"}
        </button>
        <button type="button" className={ghostButtonClass} onClick={onCancel} disabled={busy}>
          Fechar
        </button>
      </div>
    </form>
  );
}
