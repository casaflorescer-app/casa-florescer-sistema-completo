"use client";

import { useCallback, useMemo } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { APPOINTMENT_STATUSES, APPOINTMENT_STATUS_LABEL } from "@/lib/attendance/directory";
import type { AppointmentKind, AppointmentStatus } from "@/lib/types/database";
import { fieldClass, ghostButtonClass } from "@/components/platform/Ui";
import { buttonVariantClass } from "@/components/ui/buttonStyles";
import {
  addDaysInputDate,
  APPOINTMENT_KIND_LABEL,
  todayInputDate,
} from "@/components/attendance/agenda-display";
import { EntityCombobox } from "@/components/ui/EntityCombobox";
import {
  searchPatientOptions,
  searchProcedureOptions,
  searchProfessionalOptions,
  searchRoomOptions,
} from "@/lib/search/entity-search";

const labelClass = "text-xs font-semibold uppercase tracking-wide text-lotus-500";

function presetClass(active: boolean) {
  return active
    ? `${buttonVariantClass.primary} min-h-9 px-3 py-1.5 text-sm`
    : `${ghostButtonClass} min-h-9 px-3 py-1.5 text-sm`;
}

export function AgendaFilters({
  supabase,
  organizationId,
  practiceId,
  dateFrom,
  dateTo,
  patientId,
  patientLabel,
  professionalId,
  professionalLabel,
  roomId,
  roomLabel,
  procedureId,
  procedureLabel,
  kind,
  status,
  onDateFromChange,
  onDateToChange,
  onRangeChange,
  onPatientChange,
  onProfessionalChange,
  onRoomChange,
  onProcedureChange,
  onKindChange,
  onStatusChange,
  onClearFilters,
}: {
  supabase: SupabaseClient;
  organizationId: string;
  practiceId: string;
  dateFrom: string;
  dateTo: string;
  patientId: string;
  patientLabel: string;
  professionalId: string;
  professionalLabel: string;
  roomId: string;
  roomLabel: string;
  procedureId: string;
  procedureLabel: string;
  kind: AppointmentKind | "";
  status: AppointmentStatus | "";
  onDateFromChange: (value: string) => void;
  onDateToChange: (value: string) => void;
  onRangeChange: (from: string, to: string) => void;
  onPatientChange: (id: string, label: string) => void;
  onProfessionalChange: (id: string, label: string) => void;
  onRoomChange: (id: string, label: string) => void;
  onProcedureChange: (id: string, label: string) => void;
  onKindChange: (value: AppointmentKind | "") => void;
  onStatusChange: (value: AppointmentStatus | "") => void;
  onClearFilters: () => void;
}) {
  const today = todayInputDate();
  const weekStart = addDaysInputDate(today, -((new Date(`${today}T12:00:00`).getDay() + 6) % 7));
  const weekEnd = addDaysInputDate(weekStart, 6);

  const activePreset = useMemo(() => {
    if (dateFrom === today && dateTo === today) return "hoje";
    if (dateFrom === today && dateTo === addDaysInputDate(today, 6)) return "7";
    if (dateFrom === today && dateTo === addDaysInputDate(today, 13)) return "14";
    if (dateFrom === weekStart && dateTo === weekEnd) return "semana";
    return null;
  }, [dateFrom, dateTo, today, weekEnd, weekStart]);

  const hasEntityFilters = Boolean(
    patientId || professionalId || roomId || procedureId || kind || status,
  );

  const searchPatients = useCallback(
    (query: string) => searchPatientOptions(supabase, query, { limit: 30 }),
    [supabase],
  );
  const searchProfessionals = useCallback(
    (query: string) =>
      searchProfessionalOptions(supabase, query, { practiceId, limit: 30 }),
    [practiceId, supabase],
  );
  const searchRooms = useCallback(
    (query: string) =>
      searchRoomOptions(supabase, query, { organizationId, limit: 40 }),
    [organizationId, supabase],
  );
  const searchProcedures = useCallback(
    (query: string) =>
      searchProcedureOptions(supabase, query, { organizationId, practiceId, limit: 30 }),
    [organizationId, practiceId, supabase],
  );

  return (
    <div className="mt-6 space-y-4 rounded-2xl border border-lotus-100 bg-white p-4 sm:p-5" data-agenda-filters="true">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-2" role="group" aria-label="Período rápido">
          <button
            type="button"
            className={presetClass(activePreset === "hoje")}
            aria-pressed={activePreset === "hoje"}
            onClick={() => onRangeChange(today, today)}
          >
            Hoje
          </button>
          <button
            type="button"
            className={presetClass(activePreset === "7")}
            aria-pressed={activePreset === "7"}
            onClick={() => onRangeChange(today, addDaysInputDate(today, 6))}
          >
            7 dias
          </button>
          <button
            type="button"
            className={presetClass(activePreset === "14")}
            aria-pressed={activePreset === "14"}
            onClick={() => onRangeChange(today, addDaysInputDate(today, 13))}
          >
            14 dias
          </button>
          <button
            type="button"
            className={presetClass(activePreset === "semana")}
            aria-pressed={activePreset === "semana"}
            onClick={() => onRangeChange(weekStart, weekEnd)}
          >
            Esta semana
          </button>
        </div>
        {hasEntityFilters ? (
          <button type="button" className={ghostButtonClass} onClick={onClearFilters}>
            Limpar filtros
          </button>
        ) : null}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        <label className={labelClass}>
          De
          <input
            type="date"
            className={fieldClass}
            value={dateFrom}
            onChange={(event) => onDateFromChange(event.target.value)}
          />
        </label>
        <label className={labelClass}>
          Até
          <input
            type="date"
            className={fieldClass}
            value={dateTo}
            min={dateFrom}
            onChange={(event) => onDateToChange(event.target.value)}
          />
        </label>
        <label className={labelClass}>
          Paciente
          <EntityCombobox
            value={patientId}
            selectedLabel={patientLabel}
            onChange={(id, option) => onPatientChange(id, option?.label ?? "")}
            onSearch={searchPatients}
            minChars={2}
            placeholder="Nome, CPF ou telefone…"
            emptyLabel="Nenhum paciente encontrado."
          />
        </label>
        <label className={labelClass}>
          Profissional
          <EntityCombobox
            value={professionalId}
            selectedLabel={professionalLabel}
            onChange={(id, option) => onProfessionalChange(id, option?.label ?? "")}
            onSearch={searchProfessionals}
            minChars={2}
            placeholder="Nome ou registro…"
            emptyLabel="Nenhum profissional encontrado."
          />
        </label>
        <label className={labelClass}>
          Sala
          <EntityCombobox
            value={roomId}
            selectedLabel={roomLabel}
            onChange={(id, option) => onRoomChange(id, option?.label ?? "")}
            onSearch={searchRooms}
            minChars={1}
            placeholder="Nome ou código…"
            emptyLabel="Nenhuma sala encontrada."
          />
        </label>
        <label className={labelClass}>
          Procedimento
          <EntityCombobox
            value={procedureId}
            selectedLabel={procedureLabel}
            onChange={(id, option) => onProcedureChange(id, option?.label ?? "")}
            onSearch={searchProcedures}
            minChars={2}
            placeholder="Nome ou código…"
            emptyLabel="Nenhum procedimento encontrado."
          />
        </label>
        <label className={labelClass}>
          Tipo
          <select
            className={fieldClass}
            value={kind}
            onChange={(event) => onKindChange(event.target.value as AppointmentKind | "")}
          >
            <option value="">Todos</option>
            <option value="consultation">{APPOINTMENT_KIND_LABEL.consultation}</option>
            <option value="procedure">{APPOINTMENT_KIND_LABEL.procedure}</option>
          </select>
        </label>
        <label className={labelClass}>
          Status
          <select
            className={fieldClass}
            value={status}
            onChange={(event) => onStatusChange(event.target.value as AppointmentStatus | "")}
          >
            <option value="">Todos</option>
            {APPOINTMENT_STATUSES.map((item) => (
              <option key={item} value={item}>
                {APPOINTMENT_STATUS_LABEL[item]}
              </option>
            ))}
          </select>
        </label>
      </div>
    </div>
  );
}
