"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { useAuth } from "@/components/auth/AuthProvider";
import { hasStaffRole } from "@/lib/auth/access";
import { usePracticeUi } from "@/components/layout/PracticeUi";
import { StatusMessage, buttonClass } from "@/components/platform/Ui";
import { createClient } from "@/lib/supabase/client";
import {
  appointmentSetStatus,
  encounterOpenFromAppointment,
  listAppointments,
  type AppointmentRow,
  type OperationalAppointmentStatus,
} from "@/lib/attendance/directory";
import { listPatients, type PatientListRow } from "@/lib/patients/directory";
import { listProfessionalLabels, type ProfessionalLabel } from "@/lib/pregnancies/directory";
import type { AppointmentStatus } from "@/lib/types/database";
import { dayBoundsIso, todayInputDate } from "@/components/attendance/agenda-display";
import { AgendaDayBoard } from "@/components/attendance/AgendaDayBoard";
import { AgendaFilters } from "@/components/attendance/AgendaFilters";
import { AppointmentForm, type AgendaRoomOption } from "@/components/attendance/AppointmentForm";

function toRoom(value: Record<string, unknown>): AgendaRoomOption | null {
  const id = typeof value.id === "string" ? value.id : null;
  const name = typeof value.name === "string" && value.name.trim() ? value.name.trim() : null;
  const code = typeof value.code === "string" ? value.code : "";
  if (!id || !name) return null;
  return {
    id,
    name,
    code,
    roomKind: typeof value.room_kind === "string" ? value.room_kind : null,
    isHouse: value.is_house === true,
  };
}

export function AgendaPage() {
  const router = useRouter();
  const { authorization, authorizationLoading } = useAuth();
  const { selectedPracticeId } = usePracticeUi();
  const [date, setDate] = useState(todayInputDate);
  const [professionalId, setProfessionalId] = useState("");
  const [status, setStatus] = useState<AppointmentStatus | "">("");
  const [rows, setRows] = useState<AppointmentRow[]>([]);
  const [patients, setPatients] = useState<PatientListRow[]>([]);
  const [professionals, setProfessionals] = useState<ProfessionalLabel[]>([]);
  const [rooms, setRooms] = useState<AgendaRoomOption[]>([]);
  const [procedureNames, setProcedureNames] = useState<Map<string, string>>(new Map());
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [formBusy, setFormBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const supabase = useMemo(() => createClient(), []);

  const membership = authorization?.memberships.find(
    (item) => item.practiceId === selectedPracticeId,
  );
  const organizationId =
    membership?.practice?.organizationId ?? authorization?.profile?.organizationId ?? null;
  const userId = authorization?.user.id ?? null;

  const patientNames = useMemo(() => {
    const map = new Map<string, string>();
    for (const item of patients) map.set(item.id, item.fullName);
    return map;
  }, [patients]);

  const professionalNames = useMemo(() => {
    const map = new Map<string, string>();
    for (const item of professionals) map.set(item.id, item.fullName);
    return map;
  }, [professionals]);

  const roomById = useMemo(() => {
    const map = new Map<string, AgendaRoomOption>();
    for (const item of rooms) map.set(item.id, item);
    return map;
  }, [rooms]);

  const labelRow = useCallback(
    (row: AppointmentRow): AppointmentRow => {
      const room = roomById.get(row.roomId);
      return {
        ...row,
        patientName: patientNames.get(row.patientId) ?? row.patientName ?? null,
        professionalName: professionalNames.get(row.professionalId) ?? row.professionalName ?? null,
        roomName: room?.name ?? row.roomName ?? null,
        roomKind: room?.roomKind ?? row.roomKind ?? null,
        roomIsHouse: room?.isHouse ?? row.roomIsHouse ?? false,
        procedureName: row.procedureId ? procedureNames.get(row.procedureId) ?? row.procedureName ?? null : null,
      };
    },
    [patientNames, procedureNames, professionalNames, roomById],
  );

  useEffect(() => {
    if (authorizationLoading) return;
    if (!supabase) {
      setError("Autenticação não configurada neste ambiente.");
      setLoading(false);
      return;
    }
    if (!selectedPracticeId || !organizationId) {
      setRows([]);
      setPatients([]);
      setProfessionals([]);
      setRooms([]);
      setLoading(false);
      setError(authorization ? "Nenhuma prática selecionada." : null);
      return;
    }
    const bounds = dayBoundsIso(date);
    if (!bounds) {
      setError("Data inválida.");
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    void (async () => {
      try {
        const [appointmentRows, patientRows, professionalRows, roomResult] = await Promise.all([
          listAppointments(supabase, {
            practiceId: selectedPracticeId,
            from: bounds.from,
            to: bounds.to,
            professionalId: professionalId || undefined,
            status: status || undefined,
          }),
          listPatients(supabase),
          listProfessionalLabels(supabase, selectedPracticeId),
          supabase
            .from("rooms")
            .select("id, name, code, status, room_kind, is_house")
            .eq("organization_id", organizationId)
            .eq("status", "active")
            .order("name"),
        ]);
        if (cancelled) return;
        const procedureIds = [
          ...new Set(
            appointmentRows.flatMap((row) => (row.procedureId ? [row.procedureId] : [])),
          ),
        ];
        const names = new Map<string, string>();
        if (procedureIds.length > 0) {
          const procedures = await supabase.from("procedures").select("id, name").in("id", procedureIds);
          if (!procedures.error) {
            for (const item of procedures.data ?? []) {
              const record = item as { id?: string; name?: string };
              if (record.id && record.name?.trim()) names.set(record.id, record.name.trim());
            }
          }
        }
        if (cancelled) return;
        setProcedureNames(names);
        if (roomResult.error) {
          setRooms([]);
          setError("Não foi possível carregar as salas.");
        } else {
          setRooms(
            (roomResult.data ?? []).flatMap((item) => {
              const room = toRoom(item as Record<string, unknown>);
              return room ? [room] : [];
            }),
          );
          setError(null);
        }
        setPatients(patientRows);
        setProfessionals(professionalRows);
        setRows(appointmentRows);
      } catch (err: unknown) {
        if (cancelled) return;
        setRows([]);
        setError(err instanceof Error ? err.message : "Não foi possível carregar a agenda.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    authorization,
    authorizationLoading,
    date,
    supabase,
    organizationId,
    professionalId,
    reloadKey,
    selectedPracticeId,
    status,
  ]);

  const labeledRows = useMemo(() => rows.map(labelRow), [labelRow, rows]);

  async function withClient(
    appointmentId: string,
    run: (supabase: SupabaseClient) => Promise<void>,
  ) {
    if (!supabase) {
      setError("Autenticação não configurada neste ambiente.");
      return;
    }
    setBusyId(appointmentId);
    setError(null);
    setNotice(null);
    try {
      await run(supabase);
    } finally {
      setBusyId(null);
    }
  }

  function onSetStatus(appointmentId: string, nextStatus: OperationalAppointmentStatus) {
    void withClient(appointmentId, async (supabase) => {
      const result = await appointmentSetStatus(supabase, appointmentId, nextStatus);
      if (result.error || !result.row) {
        setError(result.error ?? "Não foi possível alterar o status.");
        return;
      }
      setRows((current) => {
        if (status && result.row && result.row.status !== status) {
          return current.filter((item) => item.id !== appointmentId);
        }
        return current.map((item) => (item.id === appointmentId ? result.row! : item));
      });
    });
  }

  function onStartEncounter(appointmentId: string) {
    void withClient(appointmentId, async (supabase) => {
      const result = await encounterOpenFromAppointment(supabase, appointmentId);
      if (result.error || !result.encounterId) {
        setError(result.error ?? "Não foi possível iniciar o atendimento.");
        return;
      }
      router.push(`/app/records/${result.encounterId}`);
    });
  }

  const canCreate = Boolean(supabase && organizationId && selectedPracticeId && userId);
  const canStartEncounter = authorization ? hasStaffRole(authorization, "physician") : false;

  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-lotus-500">Clínica</p>
      <h1 className="page-title mt-1">Agenda</h1>
      <p className="page-sub mt-2">
        Agendamento, confirmação e check-in do dia. O prontuário abre quando a médica inicia o
        atendimento.
      </p>

      <StatusMessage error={error} notice={notice} />

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-lotus-600">
          {loading
            ? "Carregando…"
            : `${labeledRows.length} ${labeledRows.length === 1 ? "atendimento" : "atendimentos"}`}
        </p>
        <button
          type="button"
          className={buttonClass}
          disabled={!canCreate || formBusy}
          onClick={() => setShowForm((open) => !open)}
        >
          Novo atendimento
        </button>
      </div>

      <AgendaFilters
        date={date}
        professionalId={professionalId}
        status={status}
        professionals={professionals}
        onDateChange={setDate}
        onProfessionalChange={setProfessionalId}
        onStatusChange={setStatus}
      />

      {showForm && supabase && organizationId && selectedPracticeId && userId ? (
        <AppointmentForm
          supabase={supabase}
          organizationId={organizationId}
          practiceId={selectedPracticeId}
          createdBy={userId}
          defaultDate={date}
          patients={patients}
          professionals={professionals}
          rooms={rooms}
          busy={formBusy}
          onBusy={setFormBusy}
          onCancel={() => setShowForm(false)}
          onCreated={(message, bookedDate) => {
            setShowForm(false);
            setNotice(message);
            setDate(bookedDate);
            setProfessionalId("");
            setStatus("");
            setReloadKey((value) => value + 1);
          }}
        />
      ) : null}

      <AgendaDayBoard
        date={date}
        rows={labeledRows}
        loading={loading || authorizationLoading}
        busyId={busyId}
        canStartEncounter={canStartEncounter}
        onSetStatus={onSetStatus}
        onStartEncounter={onStartEncounter}
      />
    </div>
  );
}
