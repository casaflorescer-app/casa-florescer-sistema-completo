"use client";

import { useCallback, useState, type FormEvent } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { updateAppointment, type AppointmentRow } from "@/lib/attendance/directory";
import type { ProfessionalLabel } from "@/lib/pregnancies/directory";
import type { AppointmentKind } from "@/lib/types/database";
import { fieldClass } from "@/components/platform/Ui";
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
import type { AgendaRoomOption } from "@/components/attendance/AppointmentForm";
import { EntityCombobox } from "@/components/ui/EntityCombobox";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { FormActions } from "@/components/ui/FormActions";
import {
  searchPatientOptions,
  searchProcedureOptions,
  searchProfessionalOptions,
  searchRoomOptions,
} from "@/lib/search/entity-search";
import { friendlyError } from "@/lib/ui/friendly-error";

const labelClass = "text-sm font-medium text-lotus-800";

export function EditAppointmentForm({
  supabase,
  organizationId,
  practiceId,
  appointment,
  professionals,
  rooms,
  occupancy,
  busy,
  onBusy,
  onSaved,
  onCancel,
}: {
  supabase: SupabaseClient;
  organizationId: string;
  practiceId: string;
  appointment: AppointmentRow;
  professionals: ProfessionalLabel[];
  rooms: AgendaRoomOption[];
  occupancy: RoomOccupancy[];
  busy: boolean;
  onBusy: (value: boolean) => void;
  onSaved: (message: string, bookedDate: string) => void;
  onCancel: () => void;
}) {
  const [patientId, setPatientId] = useState(appointment.patientId);
  const [patientLabel, setPatientLabel] = useState(appointment.patientName ?? "Paciente");
  const [professionalId, setProfessionalId] = useState(appointment.professionalId);
  const [professionalLabel, setProfessionalLabel] = useState(
    appointment.professionalName ?? "Profissional",
  );
  const [roomId, setRoomId] = useState(appointment.roomId);
  const [roomLabel, setRoomLabel] = useState(appointment.roomName ?? "Sala");
  const [date, setDate] = useState(isoToInputDate(appointment.startsAt));
  const [startsAt, setStartsAt] = useState(isoToInputTime(appointment.startsAt));
  const [endsAt, setEndsAt] = useState(isoToInputTime(appointment.endsAt));
  const [kind, setKind] = useState<AppointmentKind>(appointment.kind);
  const [procedureId, setProcedureId] = useState(appointment.procedureId ?? "");
  const [procedureLabel, setProcedureLabel] = useState(appointment.procedureName ?? "");
  const [urgencyNote, setUrgencyNote] = useState(appointment.urgencyNote ?? "");
  const [error, setError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmSummary, setConfirmSummary] = useState("");
  const [pendingPayload, setPendingPayload] = useState<{
    startIso: string;
    endIso: string;
  } | null>(null);

  const searchPatients = useCallback(
    (query: string) => searchPatientOptions(supabase, query, { limit: 30 }),
    [supabase],
  );
  const searchProfessionalsCb = useCallback(
    (query: string) =>
      searchProfessionalOptions(supabase, query, { practiceId, limit: 30 }),
    [practiceId, supabase],
  );
  const searchRoomsCb = useCallback(
    (query: string) =>
      searchRoomOptions(supabase, query, { organizationId, limit: 40 }),
    [organizationId, supabase],
  );
  const searchProceduresCb = useCallback(
    (query: string) =>
      searchProcedureOptions(supabase, query, {
        organizationId,
        practiceId,
        limit: 30,
      }),
    [organizationId, practiceId, supabase],
  );

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
    return room ? { id: room.id, label: room.name } : { id: roomId, label: roomLabel };
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

    const procedureName =
      kind === "procedure" ? procedureLabel || "Procedimento" : "Consulta (sem procedimento)";
    setConfirmSummary(
      [
        `Paciente: ${patientLabel || "Paciente"}`,
        `Profissional: ${professionalLabel || "Profissional"}`,
        `Tipo: ${procedureName}`,
        `Data: ${date}`,
        `Horário: ${formatClock(startIso)}–${formatClock(endIso)}`,
        `Sala: ${roomLabel || "Sala"}`,
      ].join("\n"),
    );
    setPendingPayload({ startIso, endIso });
    setConfirmOpen(true);
  }

  async function persistChanges() {
    if (!pendingPayload) return;
    setConfirmOpen(false);
    onBusy(true);
    setError(null);
    try {
      const result = await updateAppointment(supabase, {
        appointmentId: appointment.id,
        patientId,
        professionalId,
        roomId,
        procedureId: kind === "procedure" ? procedureId : null,
        kind,
        startsAt: pendingPayload.startIso,
        endsAt: pendingPayload.endIso,
        urgencyNote: urgencyNote.trim() || null,
      });
      if (result.error || !result.row) {
        setError(
          friendlyError(result.error, "Não foi possível salvar o agendamento."),
        );
        return;
      }
      onSaved("Agendamento atualizado com sucesso.", date);
    } catch (err) {
      setError(friendlyError(err, "Não foi possível salvar o agendamento."));
    } finally {
      onBusy(false);
      setPendingPayload(null);
    }
  }

  const suggested = singleOccupancyForProfessional(occupancy, professionalId);
  const suggestedRoom = suggested ? rooms.find((room) => room.id === suggested.roomId) : undefined;
  const blocked = professionals.length === 0 || rooms.length === 0;

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
            selectedLabel={patientLabel}
            onChange={(id, option) => {
              setPatientId(id);
              setPatientLabel(option?.label ?? "");
            }}
            onSearch={searchPatients}
            minChars={2}
            required
            placeholder="Digite o nome, CPF ou telefone…"
          />
        </label>
        <label className={labelClass}>
          Profissional
          <EntityCombobox
            value={professionalId}
            selectedLabel={professionalLabel}
            onChange={(id, option) => chooseProfessional(id, option?.label)}
            onSearch={searchProfessionalsCb}
            minChars={2}
            required
            placeholder="Nome, especialidade ou registro…"
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
              onSearch={searchProceduresCb}
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
            onSearch={searchRoomsCb}
            minChars={1}
            required
            placeholder="Nome, código ou tipo de sala…"
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

      <FormActions
        primaryLabel="Salvar alterações"
        primaryBusy={busy}
        primaryDisabled={blocked}
        cancelLabel="Fechar"
        onCancel={onCancel}
      />
      <ConfirmDialog
        open={confirmOpen}
        title="Salvar alterações neste agendamento?"
        description={confirmSummary}
        confirmLabel="Salvar"
        cancelLabel="Voltar"
        busy={busy}
        onCancel={() => {
          setConfirmOpen(false);
          setPendingPayload(null);
        }}
        onConfirm={() => void persistChanges()}
      />
    </form>
  );
}
