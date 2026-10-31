"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { useAuth } from "@/components/auth/AuthProvider";
import { hasStaffRole } from "@/lib/auth/access";
import { usePracticeUi } from "@/components/layout/PracticeUi";
import { StatusMessage, ghostButtonClass } from "@/components/platform/Ui";
import { isCasaBrowserAuth } from "@/lib/auth/casa-mode";
import { loadAgendaBoardCasa } from "@/lib/casa/actions";
import { createClient } from "@/lib/supabase/client";
import { PageHeader } from "@/components/ui/PageHeader";
import { PrimaryCreateButton } from "@/components/ui/PrimaryCreateButton";
import {
  appointmentRecordArrival,
  appointmentSetStatus,
  cancelAgendaBlock,
  encounterOpenFromAppointment,
  encounterOpenReturn,
  getAppointment,
  getEncounterByAppointment,
  listAgendaBlocksForDay,
  listAppointments,
  recalculateDayPredictions,
  summarizeBlockImpact,
  type AgendaBlockRow,
  type AppointmentPredictionView,
  type AppointmentRow,
  type OperationalAppointmentStatus,
} from "@/lib/attendance/directory";
import { parseReturnOfNote } from "@/lib/attendance/return-link";
import { listProfessionalLabels, type ProfessionalLabel } from "@/lib/pregnancies/directory";
import type { AppointmentKind, AppointmentStatus } from "@/lib/types/database";
import { dateRangeBoundsIso, todayInputDate } from "@/components/attendance/agenda-display";
import { AgendaDayBoard } from "@/components/attendance/AgendaDayBoard";
import { AgendaFilters } from "@/components/attendance/AgendaFilters";
import { AppointmentForm, type AgendaRoomOption } from "@/components/attendance/AppointmentForm";
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
  const searchParams = useSearchParams();
  const returnOfFromQuery = searchParams.get("returnOf");
  const patientIdFromQuery = searchParams.get("patientId");
  const { authorization, authorizationLoading } = useAuth();
  const { selectedPracticeId } = usePracticeUi();
  const today = todayInputDate();
  const [dateFrom, setDateFrom] = useState(today);
  const [dateTo, setDateTo] = useState(today);
  const [patientFilterId, setPatientFilterId] = useState("");
  const [patientFilterLabel, setPatientFilterLabel] = useState("");
  const [professionalId, setProfessionalId] = useState("");
  const [professionalLabel, setProfessionalLabel] = useState("");
  const [roomFilterId, setRoomFilterId] = useState("");
  const [roomFilterLabel, setRoomFilterLabel] = useState("");
  const [procedureFilterId, setProcedureFilterId] = useState("");
  const [procedureFilterLabel, setProcedureFilterLabel] = useState("");
  const [kindFilter, setKindFilter] = useState<AppointmentKind | "">("");
  const [status, setStatus] = useState<AppointmentStatus | "">("");
  const [rows, setRows] = useState<AppointmentRow[]>([]);
  const [predictions, setPredictions] = useState<Map<string, AppointmentPredictionView>>(
    () => new Map(),
  );
  const [blocks, setBlocks] = useState<AgendaBlockRow[]>([]);
  const [professionals, setProfessionals] = useState<ProfessionalLabel[]>([]);
  const [rooms, setRooms] = useState<AgendaRoomOption[]>([]);
  const [occupancy, setOccupancy] = useState<RoomOccupancy[]>([]);
  const [procedureNames, setProcedureNames] = useState<Map<string, string>>(new Map());
  const [patientNames, setPatientNames] = useState<Map<string, string>>(() => new Map());
  const [seedPatientLabel, setSeedPatientLabel] = useState("");
  const [showForm, setShowForm] = useState(Boolean(returnOfFromQuery || patientIdFromQuery));
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
    const casa = isCasaBrowserAuth();
    if (!casa && !supabase) {
      setError("Autenticação não configurada neste ambiente.");
      setLoading(false);
      return;
    }
    if (!selectedPracticeId || !organizationId) {
      setRows([]);
      setPredictions(new Map());
      setBlocks([]);
      setProfessionals([]);
      setRooms([]);
      setOccupancy([]);
      setPatientNames(new Map());
      setLoading(false);
      setError(authorization ? "Nenhuma prática selecionada." : null);
      return;
    }
    const bounds = dateRangeBoundsIso(dateFrom, dateTo);
    if (!bounds) {
      setError("Período inválido. Informe datas De/Até coerentes.");
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    if (casa) {
      void loadAgendaBoardCasa({
        organizationId,
        filter: {
          practiceId: selectedPracticeId,
          from: bounds.from,
          to: bounds.to,
          professionalId: professionalId || undefined,
          patientId: patientFilterId || undefined,
          roomId: roomFilterId || undefined,
          procedureId: procedureFilterId || undefined,
          kind: kindFilter || undefined,
          status: status || undefined,
        },
      })
        .then((board) => {
          if (cancelled) return;
          setProcedureNames(new Map(board.procedureNames));
          setPatientNames(new Map(board.patientNames));
          setRooms(
            board.rooms.flatMap((item) => {
              const room = toRoom(item);
              return room ? [room] : [];
            }),
          );
          setOccupancy(
            board.occupancy.flatMap((item) => {
              const row = parseRoomOccupancy(item);
              return row ? [row] : [];
            }),
          );
          setProfessionals(
            board.professionals.map((row) => ({
              id: row.id,
              practiceId: row.practiceId,
              organizationId,
              fullName: row.fullName,
              councilType: "",
              councilNumber: "",
            })),
          );
          setRows(board.appointments);
          setBlocks(board.blocks);
          setPredictions(new Map());
          setError(null);
        })
        .catch((err: unknown) => {
          if (cancelled) return;
          setRows([]);
          setPredictions(new Map());
          setBlocks([]);
          setError(err instanceof Error ? err.message : "Não foi possível carregar a agenda.");
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
      return () => {
        cancelled = true;
      };
    }
    if (!supabase) return;
    void (async () => {
      try {
        const [appointmentRows, professionalRows, roomResult, occupancyResult, blockResult] =
          await Promise.all([
            listAppointments(supabase, {
              practiceId: selectedPracticeId,
              from: bounds.from,
              to: bounds.to,
              professionalId: professionalId || undefined,
              patientId: patientFilterId || undefined,
              roomId: roomFilterId || undefined,
              procedureId: procedureFilterId || undefined,
              kind: kindFilter || undefined,
              status: status || undefined,
            }),
            listProfessionalLabels(supabase, selectedPracticeId),
            supabase
              .from("rooms")
              .select("id, name, code, status, room_kind, is_house")
              .eq("organization_id", organizationId)
              .eq("status", "active")
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
        const patientIds = [...new Set(appointmentRows.map((row) => row.patientId))];
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
        const nextPatientNames = new Map<string, string>();
        if (patientIds.length > 0) {
          const patientsResult = await supabase
            .from("patients")
            .select("id, full_name")
            .in("id", patientIds);
          if (!patientsResult.error) {
            for (const item of patientsResult.data ?? []) {
              const record = item as { id?: string; full_name?: string };
              if (record.id && record.full_name?.trim()) {
                nextPatientNames.set(record.id, record.full_name.trim());
              }
            }
          }
        }
        if (cancelled) return;
        setProcedureNames(names);
        setPatientNames(nextPatientNames);
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
    dateFrom,
    dateTo,
    supabase,
    organizationId,
    professionalId,
    patientFilterId,
    roomFilterId,
    procedureFilterId,
    kindFilter,
    reloadKey,
    selectedPracticeId,
    status,
  ]);

  useEffect(() => {
    if (!supabase || !patientIdFromQuery) {
      setSeedPatientLabel("");
      return;
    }
    let cancelled = false;
    void supabase
      .from("patients")
      .select("id, full_name")
      .eq("id", patientIdFromQuery)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled) return;
        const name =
          data && typeof (data as { full_name?: unknown }).full_name === "string"
            ? String((data as { full_name: string }).full_name).trim()
            : "";
        setSeedPatientLabel(name);
      });
    return () => {
      cancelled = true;
    };
  }, [patientIdFromQuery, supabase]);

  const labeledRows = useMemo(() => rows.map(labelRow), [labelRow, rows]);

  async function withClient(
    appointmentId: string,
    run: (supabase: SupabaseClient | null) => Promise<void>,
  ) {
    if (!supabase && !isCasaBrowserAuth()) {
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
      const appointment = await getAppointment(supabase, appointmentId);
      const returnOf = parseReturnOfNote(appointment?.urgencyNote ?? null);
      const result = returnOf
        ? await encounterOpenReturn(supabase, {
            sourceEncounterId: returnOf,
            appointmentId,
          })
        : await encounterOpenFromAppointment(supabase, appointmentId);
      if (result.error || !result.encounterId) {
        setError(result.error ?? "Não foi possível iniciar o atendimento.");
        return;
      }
      // Recalcula cadeia com início clínico efetivo antes de sair da agenda.
      if (supabase && organizationId && selectedPracticeId) {
        const bounds = dateRangeBoundsIso(dateFrom, dateTo);
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

  /** Continua encounter aberto existente — não reabre assinados/cancelados e não cria novo. */
  function onContinueEncounter(appointmentId: string) {
    void withClient(appointmentId, async (supabase) => {
      const existing = await getEncounterByAppointment(supabase, appointmentId);
      if (!existing) {
        setError("Não há atendimento clínico vinculado a este horário.");
        return;
      }
      if (existing.status === "open") {
        router.push(`/app/records/${existing.id}`);
        return;
      }
      if (existing.status === "signed" || existing.status === "amended") {
        setError("Este atendimento já foi finalizado e não pode ser reaberto.");
        return;
      }
      setError("Não é possível continuar este atendimento.");
    });
  }

  function onRecordArrival(appointmentId: string) {
    void withClient(appointmentId, async (supabase) => {
      const result = await appointmentRecordArrival(supabase, appointmentId);
      if (result.error || !result.row) {
        setError(result.error ?? "Não foi possível registrar a chegada.");
        return;
      }
      setRows((current) =>
        current.map((item) => (item.id === appointmentId ? result.row! : item)),
      );
      setNotice("Chegada física registrada.");
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
      <PageHeader
        eyebrow="Clínico"
        title="Agenda"
        description="Agendamento, confirmação e check-in do dia. O prontuário abre quando a médica inicia o atendimento."
        actions={
          <>
            <button
              type="button"
              className={ghostButtonClass}
              disabled={!canCreate || formBusy || Boolean(editingId) || showForm}
              onClick={() => {
                setEditingId(null);
                setShowForm(false);
                setShowBlockForm((open) => !open);
              }}
            >
              Bloquear agenda
            </button>
            <PrimaryCreateButton
              label="Novo atendimento"
              disabled={!canCreate || formBusy || Boolean(editingId) || showBlockForm}
              onClick={() => {
                setEditingId(null);
                setShowBlockForm(false);
                setShowForm((open) => !open);
              }}
            />
          </>
        }
      />

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
            if (!supabase && !isCasaBrowserAuth()) return;
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

      <p className="mt-6 text-sm text-lotus-600">
        {loading
          ? "Carregando…"
          : `${labeledRows.length} ${labeledRows.length === 1 ? "atendimento" : "atendimentos"}`}
      </p>

      {supabase && organizationId && selectedPracticeId ? (
        <AgendaFilters
          supabase={supabase}
          organizationId={organizationId}
          practiceId={selectedPracticeId}
          dateFrom={dateFrom}
          dateTo={dateTo}
          patientId={patientFilterId}
          patientLabel={patientFilterLabel}
          professionalId={professionalId}
          professionalLabel={professionalLabel}
          roomId={roomFilterId}
          roomLabel={roomFilterLabel}
          procedureId={procedureFilterId}
          procedureLabel={procedureFilterLabel}
          kind={kindFilter}
          status={status}
          onDateFromChange={(value) => {
            setDateFrom(value);
            if (dateTo < value) setDateTo(value);
          }}
          onDateToChange={setDateTo}
          onRangeChange={(from, to) => {
            setDateFrom(from);
            setDateTo(to);
          }}
          onPatientChange={(id, label) => {
            setPatientFilterId(id);
            setPatientFilterLabel(label);
          }}
          onProfessionalChange={(id, label) => {
            setProfessionalId(id);
            setProfessionalLabel(label);
          }}
          onRoomChange={(id, label) => {
            setRoomFilterId(id);
            setRoomFilterLabel(label);
          }}
          onProcedureChange={(id, label) => {
            setProcedureFilterId(id);
            setProcedureFilterLabel(label);
          }}
          onKindChange={setKindFilter}
          onStatusChange={setStatus}
          onClearFilters={() => {
            setPatientFilterId("");
            setPatientFilterLabel("");
            setProfessionalId("");
            setProfessionalLabel("");
            setRoomFilterId("");
            setRoomFilterLabel("");
            setProcedureFilterId("");
            setProcedureFilterLabel("");
            setKindFilter("");
            setStatus("");
          }}
        />
      ) : null}

      {showBlockForm && supabase && organizationId && selectedPracticeId ? (
        <AgendaBlockForm
          supabase={supabase}
          organizationId={organizationId}
          practiceId={selectedPracticeId}
          defaultDate={dateFrom}
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
          defaultDate={dateFrom}
          professionals={professionals}
          rooms={rooms}
          occupancy={occupancy}
          busy={formBusy}
          onBusy={setFormBusy}
          initialPatientId={patientIdFromQuery ?? ""}
          initialPatientLabel={seedPatientLabel}
          returnOfEncounterId={returnOfFromQuery}
          onCancel={() => setShowForm(false)}
          onCreated={(message, bookedDate) => {
            setShowForm(false);
            setNotice(
              returnOfFromQuery ? "Retorno agendado. Abra pela agenda no dia marcado." : message,
            );
            setDateFrom(bookedDate);
            setDateTo(bookedDate);
            setProfessionalId("");
            setProfessionalLabel("");
            setPatientFilterId("");
            setPatientFilterLabel("");
            setRoomFilterId("");
            setRoomFilterLabel("");
            setKindFilter("");
            setStatus("");
            setReloadKey((value) => value + 1);
            if (returnOfFromQuery || patientIdFromQuery) {
              router.replace("/app/agenda");
            }
          }}
        />
      ) : null}

      {editingRow && supabase && organizationId && selectedPracticeId ? (
        <EditAppointmentForm
          key={editingRow.id}
          supabase={supabase}
          organizationId={organizationId}
          practiceId={selectedPracticeId}
          appointment={editingRow}
          professionals={professionals}
          rooms={rooms}
          occupancy={occupancy}
          busy={formBusy}
          onBusy={setFormBusy}
          onCancel={() => setEditingId(null)}
          onSaved={(message, bookedDate) => {
            setEditingId(null);
            setNotice(message);
            setDateFrom(bookedDate);
            setDateTo(bookedDate);
            setProfessionalId("");
            setProfessionalLabel("");
            setStatus("");
            setReloadKey((value) => value + 1);
          }}
        />
      ) : null}

      <AgendaDayBoard
        date={dateFrom}
        dateTo={dateTo}
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
        onContinueEncounter={onContinueEncounter}
        onRecordArrival={onRecordArrival}
      />
    </div>
  );
}
