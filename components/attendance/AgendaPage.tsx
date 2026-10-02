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
  cancelAgendaBlock,
  encounterOpenFromAppointment,
  listAgendaBlocksForDay,
  listAppointments,
  recalculateDayPredictions,
  summarizeBlockImpact,
  type AgendaBlockRow,
  type AppointmentPredictionView,
  type AppointmentRow,
  type OperationalAppointmentStatus,
} from "@/lib/attendance/directory";
import { listPatients, type PatientListRow } from "@/lib/patients/directory";
import { listProfessionalLabels, type ProfessionalLabel } from "@/lib/pregnancies/directory";
import type { AppointmentStatus } from "@/lib/types/database";
import { dayBoundsIso, todayInputDate } from "@/components/attendance/agenda-display";
import { AgendaDayBoard } from "@/components/attendance/AgendaDayBoard";
import { AgendaFilters } from "@/components/attendance/AgendaFilters";
import { AppointmentForm, type AgendaProcedureOption, type AgendaRoomOption } from "@/components/attendance/AppointmentForm";
import { EditAppointmentForm } from "@/components/attendance/EditAppointmentForm";
import { AgendaBlockForm } from "@/components/attendance/AgendaBlockForm";
import { AgendaBlockBanner } from "@/components/attendance/AgendaBlockBanner";
import { AgendaImpactPanel } from "@/components/attendance/AgendaImpactPanel";
import { StaffAgendaNotifications } from "@/components/attendance/StaffAgendaNotifications";
import { parseRoomOccupancy, type RoomOccupancy } from "@/lib/clinic/room-occupancy";

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
  const [predictions, setPredictions] = useState<Map<string, AppointmentPredictionView>>(
    () => new Map(),
  );
  const [blocks, setBlocks] = useState<AgendaBlockRow[]>([]);
  const [patients, setPatients] = useState<PatientListRow[]>([]);
  const [professionals, setProfessionals] = useState<ProfessionalLabel[]>([]);
  const [rooms, setRooms] = useState<AgendaRoomOption[]>([]);
  const [procedures, setProcedures] = useState<AgendaProcedureOption[]>([]);
  const [occupancy, setOccupancy] = useState<RoomOccupancy[]>([]);
  const [procedureNames, setProcedureNames] = useState<Map<string, string>>(new Map());
  const [showForm, setShowForm] = useState(false);
  const [showBlockForm, setShowBlockForm] = useState(false);
  const [showImpact, setShowImpact] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
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
      setPredictions(new Map());
      setBlocks([]);
      setPatients([]);
      setProfessionals([]);
      setRooms([]);
      setProcedures([]);
      setOccupancy([]);
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
        const [
          appointmentRows,
          patientRows,
          professionalRows,
          roomResult,
          procedureResult,
          occupancyResult,
          blockResult,
        ] = await Promise.all([
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
          supabase
            .from("procedures")
            .select("id, name, practice_id, is_shared, organization_id")
            .eq("organization_id", organizationId)
            .order("name"),
          supabase
            .from("room_occupancy_labels")
            .select("room_id, organization_id, professional_id, professional_name, occupancy")
            .eq("organization_id", organizationId),
          listAgendaBlocksForDay(supabase, {
            practiceId: selectedPracticeId,
            from: bounds.from,
            to: bounds.to,
          }),
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
        setOccupancy(
          occupancyResult.error
            ? []
            : (occupancyResult.data ?? []).flatMap((item) => {
                const row = parseRoomOccupancy(item);
                return row ? [row] : [];
              }),
        );
        setProcedures(
          procedureResult.error
            ? []
            : (procedureResult.data ?? []).flatMap((item) => {
                const record = item as Record<string, unknown>;
                const id = typeof record.id === "string" ? record.id : null;
                const name = typeof record.name === "string" ? record.name.trim() : "";
                const procedurePracticeId = typeof record.practice_id === "string" ? record.practice_id : null;
                const shared = record.is_shared === true;
                if (!id || !name) return [];
                if (procedurePracticeId !== selectedPracticeId && !shared) return [];
                return [{ id, name }];
              }),
        );
        setPatients(patientRows);
        setProfessionals(professionalRows);
        setRows(appointmentRows);
        setBlocks(blockResult.blocks);

        const predictionResult = await recalculateDayPredictions(supabase, {
          organizationId,
          practiceId: selectedPracticeId,
          appointments: appointmentRows,
          from: bounds.from,
          to: bounds.to,
          blocks: blockResult.blocks.map((block) => ({
            id: block.id,
            professionalId: block.professionalId,
            roomId: block.roomId,
            startsAt: block.startsAt,
            endsAt: block.endsAt,
            reason: block.reasonCode,
          })),
          persist: true,
        });
        if (cancelled) return;
        const nextPredictions = new Map<string, AppointmentPredictionView>();
        for (const item of predictionResult.predictions) {
          nextPredictions.set(item.appointmentId, item);
        }
        setPredictions(nextPredictions);
      } catch (err: unknown) {
        if (cancelled) return;
        setRows([]);
        setPredictions(new Map());
        setBlocks([]);
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
      // Recalcula cadeia (cancelamento / check-in / confirmação) sem polling agressivo.
      setReloadKey((value) => value + 1);
    });
  }

  function onStartEncounter(appointmentId: string) {
    void withClient(appointmentId, async (supabase) => {
      const result = await encounterOpenFromAppointment(supabase, appointmentId);
      if (result.error || !result.encounterId) {
        setError(result.error ?? "Não foi possível iniciar o atendimento.");
        return;
      }
      // Recalcula cadeia com início clínico efetivo antes de sair da agenda.
      if (organizationId && selectedPracticeId) {
        const bounds = dayBoundsIso(date);
        if (bounds) {
          const latest = await listAppointments(supabase, {
            practiceId: selectedPracticeId,
            from: bounds.from,
            to: bounds.to,
          });
          await recalculateDayPredictions(supabase, {
            organizationId,
            practiceId: selectedPracticeId,
            appointments: latest,
            persist: true,
          });
        }
      }
      router.push(`/app/records/${result.encounterId}`);
    });
  }

  const canCreate = Boolean(supabase && organizationId && selectedPracticeId && userId);
  const canStartEncounter = authorization ? hasStaffRole(authorization, "physician") : false;
  const editingRow = editingId ? labeledRows.find((item) => item.id === editingId) ?? null : null;
  const primaryBlock = blocks[0] ?? null;
  const predictionList = useMemo(() => [...predictions.values()], [predictions]);
  const primaryImpact = useMemo(() => {
    if (!primaryBlock) {
      return { affectedCount: 0, firstPredictedStartsAt: null, lastPredictedStartsAt: null, rows: [] };
    }
    return summarizeBlockImpact(labeledRows, predictionList, primaryBlock);
  }, [labeledRows, predictionList, primaryBlock]);
  const blockAffectedCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const block of blocks) {
      map.set(block.id, summarizeBlockImpact(labeledRows, predictionList, block).affectedCount);
    }
    return map;
  }, [blocks, labeledRows, predictionList]);
  const roomNames = useMemo(() => {
    const map = new Map<string, string>();
    for (const room of rooms) map.set(room.id, room.name);
    return map;
  }, [rooms]);

  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-lotus-500">Clínica</p>
      <h1 className="page-title mt-1">Agenda</h1>
      <p className="page-sub mt-2">
        Agendamento, confirmação e check-in do dia. O prontuário abre quando a médica inicia o
        atendimento.
      </p>

      <StatusMessage error={error} notice={notice} />

      <StaffAgendaNotifications
        supabase={supabase}
        reloadKey={reloadKey}
        onOpenAgenda={() => setShowImpact(true)}
      />

      {primaryBlock ? (
        <AgendaBlockBanner
          block={primaryBlock}
          professionalName={
            primaryBlock.professionalId
              ? professionalNames.get(primaryBlock.professionalId) ?? null
              : null
          }
          affectedCount={primaryImpact.affectedCount}
          firstPredictedStartsAt={primaryImpact.firstPredictedStartsAt}
          busy={formBusy}
          onViewImpact={() => setShowImpact(true)}
          onCancelBlock={() => {
            if (!supabase) return;
            void (async () => {
              setFormBusy(true);
              const result = await cancelAgendaBlock(supabase, primaryBlock.id, "Cancelado na agenda");
              setFormBusy(false);
              if (result.error) {
                setError(result.error);
                return;
              }
              setNotice("Bloqueio cancelado. Previsões serão recalculadas.");
              setShowImpact(false);
              setReloadKey((value) => value + 1);
            })();
          }}
        />
      ) : null}

      {showImpact && primaryBlock ? (
        <AgendaImpactPanel
          rows={primaryImpact.rows}
          onClose={() => setShowImpact(false)}
        />
      ) : null}

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-lotus-600">
          {loading
            ? "Carregando…"
            : `${labeledRows.length} ${labeledRows.length === 1 ? "atendimento" : "atendimentos"}`}
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className={buttonClass}
            disabled={!canCreate || formBusy || Boolean(editingId) || showForm}
            onClick={() => {
              setEditingId(null);
              setShowForm(false);
              setShowBlockForm((open) => !open);
            }}
          >
            Bloquear agenda
          </button>
          <button
            type="button"
            className={buttonClass}
            disabled={!canCreate || formBusy || Boolean(editingId) || showBlockForm}
            onClick={() => {
              setEditingId(null);
              setShowBlockForm(false);
              setShowForm((open) => !open);
            }}
          >
            Novo atendimento
          </button>
        </div>
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

      {showBlockForm && supabase && organizationId && selectedPracticeId ? (
        <AgendaBlockForm
          supabase={supabase}
          organizationId={organizationId}
          practiceId={selectedPracticeId}
          defaultDate={date}
          professionals={professionals}
          rooms={rooms}
          affectedPreviewCount={null}
          busy={formBusy}
          onBusy={setFormBusy}
          onCancel={() => setShowBlockForm(false)}
          onCreated={(_block, message) => {
            setShowBlockForm(false);
            setNotice(message);
            setReloadKey((value) => value + 1);
          }}
        />
      ) : null}

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
          procedures={procedures}
          occupancy={occupancy}
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

      {editingRow && supabase ? (
        <EditAppointmentForm
          key={editingRow.id}
          supabase={supabase}
          appointment={editingRow}
          patients={patients}
          professionals={professionals}
          rooms={rooms}
          procedures={procedures}
          occupancy={occupancy}
          busy={formBusy}
          onBusy={setFormBusy}
          onCancel={() => setEditingId(null)}
          onSaved={(message, bookedDate) => {
            setEditingId(null);
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
        blocks={blocks}
        blockAffectedCounts={blockAffectedCounts}
        professionalNames={professionalNames}
        roomNames={roomNames}
        predictions={predictions}
        loading={loading || authorizationLoading}
        busyId={busyId}
        canStartEncounter={canStartEncounter}
        canEdit={canCreate}
        editingId={editingId}
        onEdit={(appointmentId) => {
          setShowForm(false);
          setShowBlockForm(false);
          setEditingId(appointmentId);
        }}
        onSetStatus={onSetStatus}
        onStartEncounter={onStartEncounter}
      />
    </div>
  );
}
