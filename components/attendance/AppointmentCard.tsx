"use client";

import { useState } from "react";
import type { AppointmentRow, OperationalAppointmentStatus } from "@/lib/attendance/directory";
import type { AppointmentPredictionView } from "@/lib/attendance/appointment-prediction";
import { getPatient, patientChartHref } from "@/lib/patients/directory";
import { createClient } from "@/lib/supabase/client";
import {
  APPOINTMENT_KIND_LABEL,
  canEditAppointmentStatus,
  formatClock,
} from "@/components/attendance/agenda-display";
import { AppointmentPredictionSummary } from "@/components/attendance/AppointmentPredictionSummary";
import { AppointmentStatusBadge } from "@/components/attendance/AppointmentStatusBadge";
import { ROOM_NATURE_LABEL, roomNature } from "@/lib/clinic/room-presentation";
import { parseReturnOfNote } from "@/lib/attendance/return-link";
import { RowActions, type RowAction } from "@/components/ui/RowActions";
import type { OverflowItem } from "@/components/ui/OverflowMenu";
import { WhatsAppComposeDialog } from "@/components/whatsapp/WhatsAppComposeDialog";
import { buildAppointmentConfirmationMessage } from "@/lib/whatsapp/messages";

export function AppointmentCard({
  row,
  prediction,
  busy,
  canStartEncounter,
  canEdit,
  editing,
  onEdit,
  onSetStatus,
  onStartEncounter,
  onContinueEncounter,
  onRecordArrival,
}: {
  row: AppointmentRow;
  prediction?: AppointmentPredictionView | null;
  busy: boolean;
  canStartEncounter: boolean;
  canEdit: boolean;
  editing: boolean;
  onEdit: (appointmentId: string) => void;
  onSetStatus: (appointmentId: string, status: OperationalAppointmentStatus) => void;
  onStartEncounter: (appointmentId: string) => void;
  onContinueEncounter?: (appointmentId: string) => void;
  onRecordArrival?: (appointmentId: string) => void;
}) {
  function cancel() {
    if (!window.confirm("Cancelar este agendamento?")) return;
    onSetStatus(row.id, "cancelled");
  }

  const procedureLabel = row.procedureName?.trim() || APPOINTMENT_KIND_LABEL[row.kind];
  const nature = row.roomName
    ? roomNature({ roomKind: row.roomKind, isHouse: row.roomIsHouse === true })
    : null;
  const showEdit = canEdit && canEditAppointmentStatus(row.status);
  const isReturnAppointment = Boolean(parseReturnOfNote(row.urgencyNote));
  const urgencyDisplay = isReturnAppointment
    ? "Retorno clínico agendado"
    : row.urgencyNote;

  return (
    <article className="card min-w-0">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-[7.5rem_minmax(0,1fr)_minmax(0,1.15fr)_minmax(0,0.9fr)_minmax(0,1fr)_auto] xl:items-start">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-lotus-500">Horário</p>
          <p className="mt-1 text-sm font-semibold text-lotus-900">
            {formatClock(row.startsAt)}–{formatClock(row.endsAt)}
          </p>
        </div>
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-lotus-500">Médica</p>
          <p className="mt-1 text-sm font-semibold text-lotus-900">
            {row.professionalName ?? "Profissional"}
          </p>
        </div>
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-lotus-500">Sala</p>
          <p className="mt-1 text-sm text-lotus-900">{row.roomName ?? "—"}</p>
          {nature ? (
            <p className="mt-1">
              <span className="inline-flex rounded-full border border-lotus-200 bg-lotus-50 px-2.5 py-0.5 text-xs font-semibold text-lotus-800">
                {nature === "compartilhada" ? "Uso compartilhado" : ROOM_NATURE_LABEL[nature]}
              </span>
            </p>
          ) : null}
        </div>
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-lotus-500">Paciente</p>
          <h2 className="mt-1 text-sm font-semibold text-lotus-900">{row.patientName ?? "Paciente"}</h2>
        </div>
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-lotus-500">Procedimento</p>
          <p className="mt-1 text-sm text-lotus-900">{procedureLabel}</p>
          {isReturnAppointment ? (
            <p className="mt-1">
              <span className="inline-flex rounded-full border border-lotus-300 bg-lotus-50 px-2.5 py-0.5 text-xs font-semibold text-lotus-800">
                Retorno
              </span>
            </p>
          ) : null}
        </div>
        <div className="sm:justify-self-end">
          <AppointmentStatusBadge status={row.status} />
        </div>
      </div>

      {urgencyDisplay ? <p className="mt-3 text-sm text-lotus-800">{urgencyDisplay}</p> : null}

      {row.arrivalAt ? (
        <p className="mt-2 text-xs font-medium text-emerald-800">
          Chegada registrada · {formatClock(row.arrivalAt)}
        </p>
      ) : null}

      <AppointmentPredictionSummary prediction={prediction} />

      <AppointmentCardActions
        row={row}
        busy={busy}
        canStartEncounter={canStartEncounter}
        showEdit={showEdit}
        editing={editing}
        onEdit={onEdit}
        onSetStatus={onSetStatus}
        onStartEncounter={onStartEncounter}
        onContinueEncounter={onContinueEncounter}
        onRecordArrival={onRecordArrival}
        onCancel={cancel}
      />
    </article>
  );
}

function AppointmentCardActions({
  row,
  busy,
  canStartEncounter,
  showEdit,
  editing,
  onEdit,
  onSetStatus,
  onStartEncounter,
  onContinueEncounter,
  onRecordArrival,
  onCancel,
}: {
  row: AppointmentRow;
  busy: boolean;
  canStartEncounter: boolean;
  showEdit: boolean;
  editing: boolean;
  onEdit: (appointmentId: string) => void;
  onSetStatus: (appointmentId: string, status: OperationalAppointmentStatus) => void;
  onStartEncounter: (appointmentId: string) => void;
  onContinueEncounter?: (appointmentId: string) => void;
  onRecordArrival?: (appointmentId: string) => void;
  onCancel: () => void;
}) {
  const [waOpen, setWaOpen] = useState(false);
  const [waPhone, setWaPhone] = useState<string | null>(null);
  const [waName, setWaName] = useState(row.patientName ?? "Paciente");
  const [waMessage, setWaMessage] = useState("");
  const [waBusy, setWaBusy] = useState(false);

  async function openWhatsAppCompose() {
    if (!row.patientId || waBusy) return;
    setWaBusy(true);
    try {
      const supabase = createClient();
      if (!supabase) return;
      const patient = await getPatient(supabase, row.patientId);
      const name = patient?.fullName || row.patientName || "Paciente";
      const dateLabel = new Date(row.startsAt).toLocaleDateString("pt-BR");
      const timeLabel = formatClock(row.startsAt);
      setWaName(name);
      setWaPhone(patient?.phone ?? null);
      setWaMessage(
        buildAppointmentConfirmationMessage({
          patientName: name,
          dateLabel,
          timeLabel,
          professionalName: row.professionalName ?? undefined,
          roomName: row.roomName ?? undefined,
          kindLabel: APPOINTMENT_KIND_LABEL[row.kind],
        }),
      );
      setWaOpen(true);
    } catch {
      setWaPhone(null);
      setWaName(row.patientName ?? "Paciente");
      setWaMessage(
        buildAppointmentConfirmationMessage({
          patientName: row.patientName ?? "Paciente",
          dateLabel: new Date(row.startsAt).toLocaleDateString("pt-BR"),
          timeLabel: formatClock(row.startsAt),
        }),
      );
      setWaOpen(true);
    } finally {
      setWaBusy(false);
    }
  }

  let primary: RowAction | null = null;
  if (row.status === "scheduled") {
    primary = {
      id: "confirm",
      label: "Confirmar",
      disabled: busy,
      onClick: () => onSetStatus(row.id, "confirmed"),
    };
  } else if (row.status === "confirmed") {
    primary = {
      id: "checkin",
      label: "Check-in",
      disabled: busy,
      onClick: () => onSetStatus(row.id, "checked_in"),
    };
  } else if (row.status === "checked_in" && canStartEncounter) {
    primary = {
      id: "start",
      label: "Iniciar atendimento",
      disabled: busy,
      onClick: () => onStartEncounter(row.id),
    };
  } else if (row.status === "in_progress" && canStartEncounter && onContinueEncounter) {
    primary = {
      id: "continue",
      label: "Continuar atendimento",
      disabled: busy,
      onClick: () => onContinueEncounter(row.id),
    };
  } else if (row.patientId) {
    primary = {
      id: "chart",
      label: "Abrir prontuário",
      href: patientChartHref(row.patientId),
      variant: "secondary",
    };
  }

  const secondary: OverflowItem[] = [];
  if (row.patientId) {
    if (primary?.id !== "chart") {
      secondary.push({
        id: "chart",
        label: "Abrir prontuário",
        href: patientChartHref(row.patientId),
      });
    }
    secondary.push(
      { id: "rx", label: "Receitas", href: `/app/prescriptions?patientId=${row.patientId}` },
      { id: "exams", label: "Exames", href: `/app/exams?patientId=${row.patientId}` },
      {
        id: "whatsapp",
        label: waBusy ? "WhatsApp…" : "WhatsApp",
        disabled: waBusy,
        onClick: () => void openWhatsAppCompose(),
      },
    );
  }
  if (showEdit) {
    secondary.push({
      id: "edit",
      label: editing ? "Editando…" : "Editar",
      disabled: busy || editing,
      onClick: () => onEdit(row.id),
    });
  }
  if (
    !row.arrivalAt &&
    onRecordArrival &&
    row.status !== "cancelled" &&
    row.status !== "no_show" &&
    row.status !== "completed"
  ) {
    secondary.push({
      id: "arrival",
      label: "Registrar chegada",
      disabled: busy,
      onClick: () => onRecordArrival(row.id),
    });
  }
  if (row.status === "scheduled" || row.status === "confirmed") {
    secondary.push({
      id: "cancel",
      label: "Cancelar",
      disabled: busy,
      danger: true,
      onClick: onCancel,
    });
  }

  return (
    <div className="mt-4 flex flex-row flex-wrap items-center gap-2">
      {row.status === "checked_in" && !canStartEncounter ? (
        <p className="text-sm text-lotus-700">Aguardar a médica</p>
      ) : null}
      <RowActions primary={primary} secondary={secondary} />
      <WhatsAppComposeDialog
        open={waOpen}
        onClose={() => setWaOpen(false)}
        recipientName={waName}
        phone={waPhone}
        initialMessage={waMessage}
      />
    </div>
  );
}
