"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import {
  StatusMessage,
  buttonClass,
  fieldClass,
  ghostButtonClass,
} from "@/components/platform/Ui";
import {
  downloadTextFile,
  loadAppointmentsDetail,
  loadReportsSummary,
  toCsv,
} from "@/lib/reports/directory";
import {
  PERIOD_PRESET_LABEL,
  formatPeriodLabel,
  resolvePeriod,
  type PeriodPreset,
  type ReportPeriod,
} from "@/lib/reports/period";
import {
  APPOINTMENT_KIND_LABEL,
  APPOINTMENT_STATUS_LABEL,
  DOC_KIND_LABEL,
  EQUIPMENT_STATUS_LABEL,
  STOCK_MOVEMENT_LABEL,
  type AppointmentDetailRow,
  type ReportsSummary,
} from "@/lib/reports/types";

type TabId =
  | "overview"
  | "appointments"
  | "patients"
  | "documents"
  | "operations"
  | "stock";

const TABS: Array<{ id: TabId; label: string }> = [
  { id: "overview", label: "Visão geral" },
  { id: "appointments", label: "Atendimentos" },
  { id: "patients", label: "Pacientes" },
  { id: "documents", label: "Documentos" },
  { id: "operations", label: "Salas e contratos" },
  { id: "stock", label: "Estoque" },
];

const PRESETS: PeriodPreset[] = [
  "today",
  "yesterday",
  "last_7",
  "last_30",
  "month_current",
  "month_previous",
  "year_current",
  "custom",
];

function KpiCard({
  label,
  value,
  hint,
  onClick,
}: {
  label: string;
  value: number | string;
  hint?: string;
  onClick?: () => void;
}) {
  const className = `card min-w-0 p-4 text-left ${onClick ? "cursor-pointer hover:border-lotus-300" : ""}`;
  const body = (
    <>
      <p className="text-xs font-semibold uppercase tracking-wide text-lotus-500">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-lotus-900">{value}</p>
      {hint ? <p className="mt-1 text-xs text-lotus-500">{hint}</p> : null}
    </>
  );
  if (onClick) {
    return (
      <button type="button" className={className} onClick={onClick}>
        {body}
      </button>
    );
  }
  return <article className={className}>{body}</article>;
}

function BarList({
  title,
  entries,
  labels,
}: {
  title: string;
  entries: Record<string, number>;
  labels?: Record<string, string>;
}) {
  const items = Object.entries(entries).sort((a, b) => b[1] - a[1]);
  const max = Math.max(1, ...items.map(([, v]) => v));
  if (items.length === 0) {
    return (
      <section className="card p-4">
        <h3 className="text-sm font-semibold text-lotus-900">{title}</h3>
        <p className="mt-2 text-sm text-lotus-600">Sem dados no período selecionado.</p>
      </section>
    );
  }
  return (
    <section className="card space-y-3 p-4">
      <h3 className="text-sm font-semibold text-lotus-900">{title}</h3>
      <ul className="space-y-2">
        {items.map(([key, value]) => (
          <li key={key}>
            <div className="flex items-center justify-between gap-2 text-sm">
              <span className="min-w-0 truncate text-lotus-800">
                {labels?.[key] ?? key}
              </span>
              <span className="shrink-0 font-medium text-lotus-900">{value}</span>
            </div>
            <div className="mt-1 h-2 overflow-hidden rounded bg-lotus-50">
              <div
                className="h-full rounded bg-lotus-400"
                style={{ width: `${Math.round((value / max) * 100)}%` }}
              />
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function DailyBars({ daily }: { daily: Array<{ day: string; count: number }> }) {
  if (daily.length === 0) {
    return (
      <section className="card p-4">
        <h3 className="text-sm font-semibold text-lotus-900">Evolução diária (agenda)</h3>
        <p className="mt-2 text-sm text-lotus-600">Sem dados no período selecionado.</p>
      </section>
    );
  }
  const max = Math.max(1, ...daily.map((d) => d.count));
  return (
    <section className="card p-4">
      <h3 className="text-sm font-semibold text-lotus-900">Evolução diária (agenda)</h3>
      <p className="mt-1 text-xs text-lotus-500">
        Contagem por scheduled_starts_at (exclui cancelados). Unidade: atendimentos/dia.
      </p>
      <div className="mt-4 flex h-40 items-end gap-1 overflow-x-auto pb-6">
        {daily.map((d) => (
          <div key={d.day} className="flex min-w-[18px] flex-1 flex-col items-center gap-1">
            <span className="text-[10px] text-lotus-600">{d.count}</span>
            <div
              className="w-full min-w-[12px] rounded-t bg-lotus-500"
              style={{ height: `${Math.max(4, Math.round((d.count / max) * 120))}px` }}
              title={`${d.day}: ${d.count}`}
            />
            <span className="rotate-[-55deg] text-[9px] text-lotus-500">
              {d.day.slice(5)}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

export function ReportsModule() {
  const { authorization } = useAuth();
  const orgId = authorization?.profile?.organizationId ?? null;

  const [tab, setTab] = useState<TabId>("overview");
  const [preset, setPreset] = useState<PeriodPreset>("last_30");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [period, setPeriod] = useState<ReportPeriod>(() => resolvePeriod("last_30"));

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [summary, setSummary] = useState<ReportsSummary | null>(null);

  const [detailStatus, setDetailStatus] = useState("");
  const [detailKind, setDetailKind] = useState("");
  const [detailRows, setDetailRows] = useState<AppointmentDetailRow[]>([]);
  const [detailTotal, setDetailTotal] = useState(0);
  const [detailOffset, setDetailOffset] = useState(0);
  const [detailLoading, setDetailLoading] = useState(false);

  const applyPeriod = useCallback(() => {
    setPeriod(resolvePeriod(preset, customFrom, customTo));
  }, [preset, customFrom, customTo]);

  useEffect(() => {
    applyPeriod();
  }, [applyPeriod]);

  const refresh = useCallback(async () => {
    if (!orgId) {
      setError("Organização não identificada no perfil.");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await loadReportsSummary(orgId, period);
      setSummary(data);
    } catch (e) {
      setSummary(null);
      setError(e instanceof Error ? e.message : "Falha ao carregar relatórios.");
    } finally {
      setLoading(false);
    }
  }, [orgId, period]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const loadDetail = useCallback(
    async (offset = 0) => {
      if (!orgId) return;
      setDetailLoading(true);
      setError(null);
      try {
        const data = await loadAppointmentsDetail({
          organizationId: orgId,
          period,
          status: detailStatus || undefined,
          kind: detailKind || undefined,
          limit: 50,
          offset,
        });
        setDetailRows(data.rows);
        setDetailTotal(data.total);
        setDetailOffset(data.offset);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Falha no detalhe da agenda.");
      } finally {
        setDetailLoading(false);
      }
    },
    [orgId, period, detailStatus, detailKind],
  );

  useEffect(() => {
    if (tab === "appointments") void loadDetail(0);
  }, [tab, loadDetail]);

  function exportAppointmentsCsv() {
    if (detailRows.length === 0) {
      setNotice("Nenhuma linha para exportar no filtro atual.");
      return;
    }
    const csv = toCsv(
      ["id", "agendado_em", "status", "tipo", "paciente", "profissional"],
      detailRows.map((r) => [
        r.id,
        r.scheduled_starts_at,
        r.status,
        r.kind,
        r.patient_name,
        r.professional_name,
      ]),
    );
    downloadTextFile(`relatorio-atendimentos-${period.fromDate}_${period.toDate}.csv`, csv);
    setNotice("CSV exportado (somente linhas visíveis nesta página).");
  }

  return (
    <div className="min-w-0">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-lotus-500">
        Gestão Clínica
      </p>
      <h1 className="page-title mt-1">Relatórios e indicadores</h1>
      <p className="page-sub mt-2 max-w-3xl">
        Painel operacional com contagens e metadados reais. Sem faturamento, sem conteúdo clínico
        (SOAP/anamnese) e sem integrações inexistentes.
      </p>

      <section className="card mt-4 space-y-3 p-4">
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-sm text-lotus-800">
            Período
            <select
              className={fieldClass}
              value={preset}
              onChange={(e) => setPreset(e.target.value as PeriodPreset)}
            >
              {PRESETS.map((p) => (
                <option key={p} value={p}>
                  {PERIOD_PRESET_LABEL[p]}
                </option>
              ))}
            </select>
          </label>
          {preset === "custom" ? (
            <>
              <label className="text-sm text-lotus-800">
                De
                <input
                  type="date"
                  className={fieldClass}
                  value={customFrom}
                  onChange={(e) => setCustomFrom(e.target.value)}
                />
              </label>
              <label className="text-sm text-lotus-800">
                Até
                <input
                  type="date"
                  className={fieldClass}
                  value={customTo}
                  onChange={(e) => setCustomTo(e.target.value)}
                />
              </label>
            </>
          ) : null}
          <button type="button" className={buttonClass} onClick={() => void refresh()}>
            Atualizar
          </button>
        </div>
        <p className="text-sm font-medium text-lotus-800">
          Período analisado: {formatPeriodLabel(period)}
          <span className="ml-2 text-xs font-normal text-lotus-500">
            (America/Sao_Paulo · agenda via scheduled_starts_at)
          </span>
        </p>
      </section>

      <div className="mt-4 flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            className={tab === t.id ? buttonClass : ghostButtonClass}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="mt-4">
        <StatusMessage error={error} notice={notice} />
      </div>

      {loading ? <p className="mt-6 text-sm text-lotus-600">Carregando indicadores…</p> : null}

      {!loading && summary && tab === "overview" ? (
        <section className="mt-6 space-y-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            <KpiCard
              label="Atendimentos (agenda)"
              value={summary.appointments.total_in_period}
              hint="scheduled_starts_at no período"
              onClick={() => setTab("appointments")}
            />
            <KpiCard
              label="Concluídos"
              value={summary.appointments.completed}
              onClick={() => {
                setDetailStatus("completed");
                setTab("appointments");
              }}
            />
            <KpiCard label="Novos pacientes" value={summary.patients.new_in_period} />
            <KpiCard
              label="Documentos emitidos"
              value={summary.documents.finalized_in_period}
              hint="artifacts finalized"
            />
            <KpiCard
              label="Receitas assinadas"
              value={summary.prescriptions.signed_in_period}
            />
            <KpiCard
              label="Exames confirmados"
              value={summary.exam_requests.confirmed_in_period}
              hint="pedido ≠ resultado"
            />
            <KpiCard
              label="Retornos (encounters)"
              value={summary.encounters.returns_opened_in_period}
            />
            <KpiCard label="Contratos aluguel ativos" value={summary.rentals.active} />
            <KpiCard label="Estoque baixo" value={summary.stock.low_stock} />
            <KpiCard
              label="Equip. manutenção"
              value={summary.equipment.by_status.maintenance ?? 0}
            />
          </div>

          <DailyBars daily={summary.appointments.daily} />

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <BarList
              title="Atendimentos por tipo"
              entries={summary.appointments.by_kind}
              labels={APPOINTMENT_KIND_LABEL}
            />
            <BarList
              title="Atendimentos por status"
              entries={summary.appointments.by_status}
              labels={APPOINTMENT_STATUS_LABEL}
            />
          </div>

          {Object.keys(summary.unavailable).length > 0 ? (
            <section className="card space-y-2 p-4">
              <h3 className="text-sm font-semibold text-lotus-900">Não disponível</h3>
              <ul className="space-y-1 text-sm text-lotus-700">
                {Object.entries(summary.unavailable).map(([k, v]) => (
                  <li key={k}>
                    <span className="font-medium">{k}</span>: {v}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </section>
      ) : null}

      {!loading && summary && tab === "appointments" ? (
        <section className="mt-6 space-y-4">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <KpiCard label="Total" value={summary.appointments.total_in_period} />
            <KpiCard label="Concluídos" value={summary.appointments.completed} />
            <KpiCard label="Cancelados" value={summary.appointments.cancelled} />
            <KpiCard label="Faltas" value={summary.appointments.no_show} />
          </div>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <BarList
              title="Por tipo"
              entries={summary.appointments.by_kind}
              labels={APPOINTMENT_KIND_LABEL}
            />
            <BarList
              title="Por status"
              entries={summary.appointments.by_status}
              labels={APPOINTMENT_STATUS_LABEL}
            />
          </div>
          <DailyBars daily={summary.appointments.daily} />

          <section className="card space-y-3 p-4">
            <div className="flex flex-wrap items-end gap-3">
              <label className="text-sm">
                Status
                <select
                  className={fieldClass}
                  value={detailStatus}
                  onChange={(e) => setDetailStatus(e.target.value)}
                >
                  <option value="">Todos</option>
                  {Object.entries(APPOINTMENT_STATUS_LABEL).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-sm">
                Tipo
                <select
                  className={fieldClass}
                  value={detailKind}
                  onChange={(e) => setDetailKind(e.target.value)}
                >
                  <option value="">Todos</option>
                  {Object.entries(APPOINTMENT_KIND_LABEL).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                className={buttonClass}
                disabled={detailLoading}
                onClick={() => void loadDetail(0)}
              >
                Filtrar
              </button>
              <button type="button" className={ghostButtonClass} onClick={exportAppointmentsCsv}>
                Exportar CSV
              </button>
            </div>
            <p className="text-xs text-lotus-500">
              Detalhe = metadados de agenda (sem notas clínicas). Total filtrado: {detailTotal}.
            </p>
            {detailLoading ? (
              <p className="text-sm text-lotus-600">Carregando detalhe…</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] border-collapse text-left text-sm">
                  <thead>
                    <tr className="border-b border-lotus-100 text-xs uppercase text-lotus-500">
                      <th className="px-2 py-2">Quando</th>
                      <th className="px-2 py-2">Paciente</th>
                      <th className="px-2 py-2">Profissional</th>
                      <th className="px-2 py-2">Tipo</th>
                      <th className="px-2 py-2">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detailRows.map((r) => (
                      <tr key={r.id} className="border-b border-lotus-50">
                        <td className="px-2 py-2">
                          {new Date(r.scheduled_starts_at).toLocaleString("pt-BR")}
                        </td>
                        <td className="px-2 py-2">{r.patient_name}</td>
                        <td className="px-2 py-2">{r.professional_name || "—"}</td>
                        <td className="px-2 py-2">
                          {APPOINTMENT_KIND_LABEL[r.kind] ?? r.kind}
                        </td>
                        <td className="px-2 py-2">
                          {APPOINTMENT_STATUS_LABEL[r.status] ?? r.status}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {detailRows.length === 0 ? (
                  <p className="mt-3 text-sm text-lotus-600">Sem dados no período selecionado.</p>
                ) : null}
              </div>
            )}
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className={ghostButtonClass}
                disabled={detailOffset <= 0 || detailLoading}
                onClick={() => void loadDetail(Math.max(0, detailOffset - 50))}
              >
                Anterior
              </button>
              <button
                type="button"
                className={ghostButtonClass}
                disabled={detailOffset + 50 >= detailTotal || detailLoading}
                onClick={() => void loadDetail(detailOffset + 50)}
              >
                Próxima
              </button>
            </div>
          </section>

          <section className="card space-y-2 p-4 text-sm text-lotus-700">
            <h3 className="font-semibold text-lotus-900">Encounters (prontuário)</h3>
            <p>
              Abertos no período: {summary.encounters.opened_in_period} · Assinados:{" "}
              {summary.encounters.signed_in_period} · Cancelados:{" "}
              {summary.encounters.cancelled_in_period} · Retornos:{" "}
              {summary.encounters.returns_opened_in_period} · Abertos agora:{" "}
              {summary.encounters.open_now}
            </p>
            <p className="text-xs text-lotus-500">
              Retorno = encounter com return_of_encounter_id. Assinado usa signed_at.
            </p>
          </section>
        </section>
      ) : null}

      {!loading && summary && tab === "patients" ? (
        <section className="mt-6 space-y-4">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
            <KpiCard label="Pacientes cadastrados" value={summary.patients.total} />
            <KpiCard
              label="Novos no período"
              value={summary.patients.new_in_period}
              hint="patients.created_at"
            />
            <KpiCard
              label="Retornos clínicos"
              value={summary.encounters.returns_opened_in_period}
              hint="return_of_encounter_id"
            />
          </div>
          <p className="text-sm text-lotus-600">
            Classificação ginecológico/obstétrico automática:{" "}
            {summary.unavailable.specialty_clinical_split ?? "não disponível"}.
          </p>
        </section>
      ) : null}

      {!loading && summary && tab === "documents" ? (
        <section className="mt-6 space-y-4">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <KpiCard
              label="Documentos finalizados"
              value={summary.documents.finalized_in_period}
            />
            <KpiCard
              label="Receitas (assinadas)"
              value={summary.prescriptions.signed_in_period}
            />
            <KpiCard
              label="Pedidos de exame"
              value={summary.exam_requests.confirmed_in_period}
            />
            <KpiCard
              label="Publicados no portal"
              value={summary.documents.published_to_portal_in_period}
            />
          </div>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <BarList
              title="Documentos por tipo (finalized)"
              entries={summary.documents.by_kind_finalized}
              labels={DOC_KIND_LABEL}
            />
            <section className="card space-y-2 p-4 text-sm text-lotus-700">
              <h3 className="font-semibold text-lotus-900">Regras</h3>
              <ul className="list-disc space-y-1 pl-5">
                <li>Pedido de exame ≠ resultado/anexo.</li>
                <li>Rascunhos não contam como emitidos.</li>
                <li>
                  Superseded no período: {summary.documents.superseded_in_period} (histórico,
                  não “atuais”).
                </li>
                <li>Sem SNCR / ICP-Brasil.</li>
              </ul>
            </section>
          </div>
        </section>
      ) : null}

      {!loading && summary && tab === "operations" ? (
        <section className="mt-6 space-y-4">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <KpiCard label="Salas" value={summary.rooms.total} />
            <KpiCard label="Salas ativas" value={summary.rooms.active} />
            <KpiCard label="Aluguéis ativos" value={summary.rentals.active} />
            <KpiCard label="Aluguéis a vencer (30d)" value={summary.rentals.expiring_soon} />
            <KpiCard label="Aluguéis agendados" value={summary.rentals.scheduled} />
            <KpiCard label="Contratos obstétricos" value={summary.clinical_contracts.obstetric_active} />
            <KpiCard
              label="Acordos de procedimento"
              value={summary.clinical_contracts.procedure_active}
            />
            <KpiCard label="Funcionários ativos" value={summary.workforce.active} />
          </div>
          <p className="text-sm text-lotus-600">
            Aluguel de sala ≠ atendimento. Médico locatário ≠ funcionário/prestador
            (workforce).
          </p>
          <p className="text-sm text-lotus-600">
            Financeiro / valores de aluguel:{" "}
            {summary.unavailable.finance ?? "não disponível"}.
          </p>
        </section>
      ) : null}

      {!loading && summary && tab === "stock" ? (
        <section className="mt-6 space-y-4">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <KpiCard label="Itens ativos" value={summary.stock.items_active} />
            <KpiCard label="Abaixo do mínimo" value={summary.stock.low_stock} />
            <KpiCard label="Lotes vencidos" value={summary.stock.lots_expired} />
            <KpiCard label="Lotes a vencer (30d)" value={summary.stock.lots_expiring_soon} />
            <KpiCard label="Movimentações" value={summary.stock.movements_in_period} />
            <KpiCard label="Equipamentos" value={summary.equipment.total} />
            <KpiCard
              label="Em manutenção"
              value={summary.equipment.by_status.maintenance ?? 0}
            />
          </div>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <BarList
              title="Movimentações por tipo"
              entries={summary.stock.movements_by_kind}
              labels={STOCK_MOVEMENT_LABEL}
            />
            <BarList
              title="Equipamentos por situação"
              entries={summary.equipment.by_status}
              labels={EQUIPMENT_STATUS_LABEL}
            />
          </div>
          <p className="text-sm text-lotus-600">
            Consumíveis ≠ patrimônio. Detalhes operacionais em /app/inventory.
          </p>
        </section>
      ) : null}
    </div>
  );
}
