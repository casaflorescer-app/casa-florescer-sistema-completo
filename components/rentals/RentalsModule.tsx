"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import {
  StatusMessage,
  buttonClass,
  fieldClass,
  ghostButtonClass,
} from "@/components/platform/Ui";
import {
  buildContractAlerts,
  cancelRentalContract,
  createRentalContract,
  deriveDisplayStatus,
  durationLabel,
  endRentalContract,
  formatRentBRL,
  listRentalContractEvents,
  listRentalContracts,
  listRentalProfessionals,
  listSubletRooms,
  loadRentalDashboard,
  parseRentToCents,
  renewRentalContract,
  updateRentalContract,
  type RentalProfessionalOption,
} from "@/lib/rentals/directory";
import {
  RENTAL_DISPLAY_LABEL,
  RENTAL_EXPIRING_SOON_DAYS,
  type RentalContractEventRow,
  type RentalContractRow,
  type RentalContractStatus,
  type RentalDashboardStats,
  type RentalDisplayStatus,
  type RentalRoomOption,
} from "@/lib/rentals/types";

type TabId = "dashboard" | "contracts";
type FormMode = "create" | "edit" | null;

const STATUS_FILTERS: Array<{ value: string; label: string }> = [
  { value: "all", label: "Todos" },
  { value: "scheduled", label: "Futuro" },
  { value: "active", label: "Ativo" },
  { value: "expiring_soon", label: "Próximo do vencimento" },
  { value: "ended", label: "Encerrado" },
  { value: "cancelled", label: "Cancelado" },
];

const EVENT_LABEL: Record<string, string> = {
  created: "Criação",
  updated: "Alteração",
  renewed: "Renovação",
  ended: "Encerramento",
  cancelled: "Cancelamento",
  status_sync: "Sincronização de status",
};

function statusBadgeClass(status: RentalDisplayStatus): string {
  switch (status) {
    case "active":
      return "bg-emerald-50 text-emerald-900 border-emerald-200";
    case "scheduled":
      return "bg-sky-50 text-sky-900 border-sky-200";
    case "expiring_soon":
      return "bg-amber-50 text-amber-900 border-amber-200";
    case "ended":
      return "bg-lotus-50 text-lotus-700 border-lotus-200";
    case "cancelled":
      return "bg-rose-50 text-rose-900 border-rose-200";
    default:
      return "bg-lotus-50 text-lotus-700 border-lotus-200";
  }
}

function formatDateBr(iso: string | null | undefined): string {
  if (!iso) return "—";
  const [y, m, d] = iso.slice(0, 10).split("-");
  if (!y || !m || !d) return iso;
  return `${d}/${m}/${y}`;
}

function formatDateTimeBr(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Intl.DateTimeFormat("pt-BR", {
      dateStyle: "short",
      timeStyle: "short",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

type FormState = {
  roomId: string;
  professionalId: string;
  tenantName: string;
  tenantSpecialty: string;
  rentReais: string;
  startsOn: string;
  endsOn: string;
  dueDay: string;
  notes: string;
};

const emptyForm = (): FormState => ({
  roomId: "",
  professionalId: "",
  tenantName: "",
  tenantSpecialty: "",
  rentReais: "",
  startsOn: "",
  endsOn: "",
  dueDay: "10",
  notes: "",
});

export function RentalsModule({
  initialTab = "dashboard",
  focusContractId = null,
}: {
  initialTab?: TabId;
  focusContractId?: string | null;
}) {
  const { authorization } = useAuth();
  const orgId = authorization?.profile?.organizationId ?? null;

  const [tab, setTab] = useState<TabId>(initialTab);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [stats, setStats] = useState<RentalDashboardStats | null>(null);
  const [contracts, setContracts] = useState<RentalContractRow[]>([]);
  const [rooms, setRooms] = useState<RentalRoomOption[]>([]);
  const [professionals, setProfessionals] = useState<RentalProfessionalOption[]>(
    [],
  );

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [specialtyFilter, setSpecialtyFilter] = useState("");
  const [roomFilter, setRoomFilter] = useState("");
  const [fromFilter, setFromFilter] = useState("");
  const [toFilter, setToFilter] = useState("");

  const [selected, setSelected] = useState<RentalContractRow | null>(null);
  const [events, setEvents] = useState<RentalContractEventRow[]>([]);
  const [formMode, setFormMode] = useState<FormMode>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [actionReason, setActionReason] = useState("");
  const [renewStarts, setRenewStarts] = useState("");
  const [renewEnds, setRenewEnds] = useState("");
  const [showRenew, setShowRenew] = useState(false);
  const [showEnd, setShowEnd] = useState(false);
  const [showCancel, setShowCancel] = useState(false);

  const alerts = useMemo(() => buildContractAlerts(contracts), [contracts]);

  const refresh = useCallback(async () => {
    if (!orgId) {
      setError("Organização não identificada no perfil.");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [dash, list, roomOpts, profOpts] = await Promise.all([
        loadRentalDashboard(orgId),
        listRentalContracts({
          organizationId: orgId,
          search,
          status: statusFilter as RentalContractStatus | "expiring_soon" | "all",
          specialty: specialtyFilter || undefined,
          roomId: roomFilter || undefined,
          from: fromFilter || undefined,
          to: toFilter || undefined,
        }),
        listSubletRooms(orgId),
        listRentalProfessionals(orgId),
      ]);
      setStats(dash);
      setContracts(list);
      setRooms(roomOpts);
      setProfessionals(profOpts);
      if (focusContractId) {
        const found = list.find((c) => c.id === focusContractId) ?? null;
        setSelected(found);
        if (!found) {
          setError("Contrato não encontrado nesta organização (ou sem permissão).");
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao carregar aluguéis.");
    } finally {
      setLoading(false);
    }
  }, [
    orgId,
    search,
    statusFilter,
    specialtyFilter,
    roomFilter,
    fromFilter,
    toFilter,
    focusContractId,
  ]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!selected) {
      setEvents([]);
      return;
    }
    let cancelled = false;
    void listRentalContractEvents(selected.id)
      .then((rows) => {
        if (!cancelled) setEvents(rows);
      })
      .catch(() => {
        if (!cancelled) setEvents([]);
      });
    return () => {
      cancelled = true;
    };
  }, [selected]);

  function openCreate() {
    setFormMode("create");
    setForm(emptyForm());
    setSelected(null);
    setNotice(null);
    setError(null);
    setTab("contracts");
  }

  function openEdit(contract: RentalContractRow) {
    setSelected(contract);
    setFormMode("edit");
    setForm({
      roomId: contract.roomId,
      professionalId: contract.tenantProfessionalId ?? "",
      tenantName: contract.tenantName,
      tenantSpecialty: contract.tenantSpecialty,
      rentReais: (contract.monthlyRentCents / 100).toFixed(2).replace(".", ","),
      startsOn: contract.startsOn,
      endsOn: contract.endsOn ?? "",
      dueDay: contract.dueDay != null ? String(contract.dueDay) : "10",
      notes: contract.notes ?? "",
    });
    setNotice(null);
    setError(null);
  }

  function applyProfessional(id: string) {
    const prof = professionals.find((p) => p.id === id);
    setForm((prev) => ({
      ...prev,
      professionalId: id,
      tenantName: prof?.fullName ?? prev.tenantName,
      tenantSpecialty: prof?.specialty ?? prev.tenantSpecialty,
    }));
  }

  async function submitForm() {
    if (!orgId) return;
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      if (!form.roomId) throw new Error("Selecione a sala (consultório de aluguel).");
      if (!form.tenantName.trim()) throw new Error("Informe o nome do profissional/locatário.");
      if (!form.tenantSpecialty.trim()) throw new Error("Informe a especialidade.");
      if (!form.startsOn) throw new Error("Informe a data de início.");
      if (form.endsOn && form.endsOn < form.startsOn) {
        throw new Error("O término deve ser igual ou posterior ao início.");
      }
      const cents = parseRentToCents(form.rentReais);
      if (cents == null) throw new Error("Informe um valor de aluguel válido (ex.: 2500,00).");
      const due = form.dueDay ? Number(form.dueDay) : null;
      if (due != null && (!Number.isInteger(due) || due < 1 || due > 28)) {
        throw new Error("Dia de vencimento deve ser entre 1 e 28.");
      }

      if (formMode === "create") {
        const id = await createRentalContract({
          organizationId: orgId,
          roomId: form.roomId,
          tenantProfessionalId: form.professionalId || null,
          tenantName: form.tenantName.trim(),
          tenantSpecialty: form.tenantSpecialty.trim(),
          monthlyRentCents: cents,
          startsOn: form.startsOn,
          endsOn: form.endsOn || null,
          dueDay: due,
          notes: form.notes.trim() || null,
        });
        setNotice(`Contrato criado com sucesso.`);
        setFormMode(null);
        await refresh();
        const list = await listRentalContracts({ organizationId: orgId });
        setSelected(list.find((c) => c.id === id) ?? null);
      } else if (formMode === "edit" && selected) {
        await updateRentalContract({
          contractId: selected.id,
          roomId: form.roomId,
          tenantProfessionalId: form.professionalId || null,
          tenantName: form.tenantName.trim(),
          tenantSpecialty: form.tenantSpecialty.trim(),
          monthlyRentCents: cents,
          startsOn: form.startsOn,
          endsOn: form.endsOn || null,
          dueDay: due,
          notes: form.notes.trim() || null,
        });
        setNotice("Contrato atualizado.");
        setFormMode(null);
        await refresh();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível salvar o contrato.");
    } finally {
      setSaving(false);
    }
  }

  async function confirmEnd() {
    if (!selected) return;
    setSaving(true);
    setError(null);
    try {
      await endRentalContract(selected.id, actionReason.trim() || null);
      setNotice("Contrato encerrado.");
      setShowEnd(false);
      setActionReason("");
      setSelected(null);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao encerrar.");
    } finally {
      setSaving(false);
    }
  }

  async function confirmCancel() {
    if (!selected) return;
    if (!actionReason.trim()) {
      setError("Informe o motivo do cancelamento.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await cancelRentalContract(selected.id, actionReason.trim());
      setNotice("Contrato cancelado (registro preservado).");
      setShowCancel(false);
      setActionReason("");
      setSelected(null);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao cancelar.");
    } finally {
      setSaving(false);
    }
  }

  async function confirmRenew() {
    if (!selected) return;
    if (!renewStarts) {
      setError("Informe o início do novo período.");
      return;
    }
    if (renewEnds && renewEnds < renewStarts) {
      setError("No renovação, o término deve ser ≥ início.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const newId = await renewRentalContract({
        contractId: selected.id,
        startsOn: renewStarts,
        endsOn: renewEnds || null,
      });
      setNotice("Renovação registrada: contrato anterior preservado; novo contrato criado.");
      setShowRenew(false);
      setRenewStarts("");
      setRenewEnds("");
      await refresh();
      if (orgId) {
        const list = await listRentalContracts({ organizationId: orgId });
        setSelected(list.find((c) => c.id === newId) ?? null);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao renovar.");
    } finally {
      setSaving(false);
    }
  }

  const selectedDisplay = selected ? deriveDisplayStatus(selected) : null;
  const canMutate =
    selected &&
    (selected.status === "active" || selected.status === "scheduled");

  return (
    <div className="min-w-0">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-lotus-500">
        Gestão Clínica
      </p>
      <h1 className="page-title mt-1">Aluguéis e Contratos</h1>
      <p className="page-sub mt-2 max-w-3xl">
        Relação administrativa/comercial de locação de consultórios. A agenda clínica
        permanece independente — o contrato não bloqueia agendamentos automaticamente.
      </p>

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          className={tab === "dashboard" ? buttonClass : ghostButtonClass}
          onClick={() => setTab("dashboard")}
        >
          Painel
        </button>
        <button
          type="button"
          className={tab === "contracts" ? buttonClass : ghostButtonClass}
          onClick={() => setTab("contracts")}
        >
          Contratos
        </button>
        <button type="button" className={buttonClass} onClick={openCreate}>
          Novo contrato
        </button>
      </div>

      <div className="mt-4">
        <StatusMessage error={error} notice={notice} />
      </div>

      {loading ? (
        <p className="mt-6 text-sm text-lotus-600">Carregando aluguéis…</p>
      ) : null}

      {!loading && tab === "dashboard" ? (
        <section className="mt-6 space-y-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {[
              { label: "Ativos", value: stats?.active ?? 0 },
              { label: "Futuros", value: stats?.scheduled ?? 0 },
              { label: "Próx. vencimento", value: stats?.expiringSoon ?? 0 },
              { label: "Encerrados", value: stats?.ended ?? 0 },
              { label: "Cancelados", value: stats?.cancelled ?? 0 },
              {
                label: "Salas ocupadas",
                value: stats?.roomsWithActiveContract ?? 0,
              },
              {
                label: "Salas sublet",
                value: stats?.subletRooms ?? 0,
              },
              {
                label: "Disponíveis (sublet)",
                value: Math.max(
                  0,
                  (stats?.subletRooms ?? 0) - (stats?.roomsWithActiveContract ?? 0),
                ),
              },
            ].map((card) => (
              <article key={card.label} className="card min-w-0 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-lotus-500">
                  {card.label}
                </p>
                <p className="mt-2 text-2xl font-semibold text-lotus-900">{card.value}</p>
              </article>
            ))}
          </div>

          <p className="text-xs text-lotus-500">
            “Próximo do vencimento” = contratos ativos com término em até{" "}
            {RENTAL_EXPIRING_SOON_DAYS} dias (configuração única do módulo).
          </p>

          {alerts.length > 0 ? (
            <section className="card space-y-2 p-4">
              <h2 className="text-sm font-semibold text-lotus-900">Alertas</h2>
              <ul className="space-y-2">
                {alerts.map((a) => (
                  <li
                    key={a.id}
                    className={`rounded-lg border px-3 py-2 text-sm ${
                      a.severity === "error"
                        ? "border-rose-200 bg-rose-50 text-rose-900"
                        : "border-amber-200 bg-amber-50 text-amber-950"
                    }`}
                  >
                    {a.message}
                  </li>
                ))}
              </ul>
            </section>
          ) : (
            <section className="card p-4 text-sm text-lotus-700">
              Nenhum alerta operacional no momento.
            </section>
          )}
        </section>
      ) : null}

      {!loading && tab === "contracts" ? (
        <section className="mt-6 space-y-4">
          <div className="card grid grid-cols-1 gap-3 p-4 md:grid-cols-2 xl:grid-cols-3">
            <label className="block text-sm text-lotus-800">
              Buscar (profissional, contrato, sala)
              <input
                className={fieldClass}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Nome, código, sala…"
              />
            </label>
            <label className="block text-sm text-lotus-800">
              Status
              <select
                className={fieldClass}
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
              >
                {STATUS_FILTERS.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm text-lotus-800">
              Especialidade
              <input
                className={fieldClass}
                value={specialtyFilter}
                onChange={(e) => setSpecialtyFilter(e.target.value)}
                placeholder="Filtrar especialidade"
              />
            </label>
            <label className="block text-sm text-lotus-800">
              Sala
              <select
                className={fieldClass}
                value={roomFilter}
                onChange={(e) => setRoomFilter(e.target.value)}
              >
                <option value="">Todas</option>
                {rooms.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.code} — {r.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm text-lotus-800">
              Início a partir de
              <input
                type="date"
                className={fieldClass}
                value={fromFilter}
                onChange={(e) => setFromFilter(e.target.value)}
              />
            </label>
            <label className="block text-sm text-lotus-800">
              Início até
              <input
                type="date"
                className={fieldClass}
                value={toFilter}
                onChange={(e) => setToFilter(e.target.value)}
              />
            </label>
          </div>

          {rooms.length === 0 ? (
            <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
              Nenhuma sala classificada como consultório de aluguel (sublet). Classifique a
              sala em Gestão de Salas antes de criar contratos.
            </p>
          ) : null}

          {/* Desktop table */}
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full min-w-[720px] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-lotus-100 text-xs uppercase tracking-wide text-lotus-500">
                  <th className="px-2 py-2 font-semibold">Contrato</th>
                  <th className="px-2 py-2 font-semibold">Profissional</th>
                  <th className="px-2 py-2 font-semibold">Sala</th>
                  <th className="px-2 py-2 font-semibold">Período</th>
                  <th className="px-2 py-2 font-semibold">Valor</th>
                  <th className="px-2 py-2 font-semibold">Status</th>
                  <th className="px-2 py-2 font-semibold">Ações</th>
                </tr>
              </thead>
              <tbody>
                {contracts.map((c) => {
                  const display = deriveDisplayStatus(c);
                  return (
                    <tr key={c.id} className="border-b border-lotus-50 align-top">
                      <td className="px-2 py-3 font-medium text-lotus-900">
                        {c.contractCode ?? c.id.slice(0, 8)}
                      </td>
                      <td className="px-2 py-3">
                        <div className="font-medium text-lotus-900">{c.tenantName}</div>
                        <div className="text-xs text-lotus-500">{c.tenantSpecialty}</div>
                      </td>
                      <td className="px-2 py-3">
                        {c.roomCode ? `${c.roomCode} — ` : ""}
                        {c.roomName ?? "—"}
                      </td>
                      <td className="px-2 py-3 whitespace-nowrap">
                        {formatDateBr(c.startsOn)} → {formatDateBr(c.endsOn)}
                      </td>
                      <td className="px-2 py-3 whitespace-nowrap">
                        {formatRentBRL(c.monthlyRentCents)}
                      </td>
                      <td className="px-2 py-3">
                        <span
                          className={`inline-flex rounded-lg border px-2 py-0.5 text-xs font-medium ${statusBadgeClass(display)}`}
                        >
                          {RENTAL_DISPLAY_LABEL[display]}
                        </span>
                      </td>
                      <td className="px-2 py-3">
                        <button
                          type="button"
                          className="text-sm font-medium text-lotus-800 underline"
                          onClick={() => {
                            setSelected(c);
                            setFormMode(null);
                          }}
                        >
                          Detalhes
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {contracts.length === 0 ? (
              <p className="mt-4 text-sm text-lotus-600">Nenhum contrato encontrado.</p>
            ) : null}
          </div>

          {/* Mobile cards */}
          <ul className="space-y-3 md:hidden">
            {contracts.map((c) => {
              const display = deriveDisplayStatus(c);
              return (
                <li key={c.id}>
                  <article className="card space-y-2 p-4">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p className="text-xs font-semibold uppercase text-lotus-500">
                          {c.contractCode ?? "Sem código"}
                        </p>
                        <h3 className="text-base font-semibold text-lotus-900">
                          {c.tenantName}
                        </h3>
                        <p className="text-sm text-lotus-600">{c.tenantSpecialty}</p>
                      </div>
                      <span
                        className={`inline-flex rounded-lg border px-2 py-0.5 text-xs font-medium ${statusBadgeClass(display)}`}
                      >
                        {RENTAL_DISPLAY_LABEL[display]}
                      </span>
                    </div>
                    <p className="text-sm text-lotus-700">
                      Sala: {c.roomCode ? `${c.roomCode} — ` : ""}
                      {c.roomName ?? "—"}
                    </p>
                    <p className="text-sm text-lotus-700">
                      {formatDateBr(c.startsOn)} → {formatDateBr(c.endsOn)} ·{" "}
                      {formatRentBRL(c.monthlyRentCents)}
                    </p>
                    <button
                      type="button"
                      className={ghostButtonClass}
                      onClick={() => {
                        setSelected(c);
                        setFormMode(null);
                      }}
                    >
                      Ver detalhes
                    </button>
                  </article>
                </li>
              );
            })}
            {contracts.length === 0 ? (
              <li className="text-sm text-lotus-600">Nenhum contrato encontrado.</li>
            ) : null}
          </ul>
        </section>
      ) : null}

      {/* Detail panel */}
      {selected && formMode === null ? (
        <section className="card mt-6 space-y-4 p-4 sm:p-6" id="contrato-detalhe">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-lotus-500">
                Identificação
              </p>
              <h2 className="mt-1 text-xl font-semibold text-lotus-900">
                {selected.contractCode ?? selected.id}
              </h2>
              {selectedDisplay ? (
                <span
                  className={`mt-2 inline-flex rounded-lg border px-2 py-0.5 text-xs font-medium ${statusBadgeClass(selectedDisplay)}`}
                >
                  {RENTAL_DISPLAY_LABEL[selectedDisplay]}
                </span>
              ) : null}
              <p className="mt-2 text-xs text-lotus-500">
                Criado em {formatDateTimeBr(selected.createdAt)}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {canMutate ? (
                <>
                  <button
                    type="button"
                    className={ghostButtonClass}
                    onClick={() => openEdit(selected)}
                  >
                    Editar
                  </button>
                  <button
                    type="button"
                    className={ghostButtonClass}
                    onClick={() => {
                      setShowRenew(true);
                      setRenewStarts(selected.endsOn
                        ? (() => {
                            const d = new Date(`${selected.endsOn}T12:00:00`);
                            d.setDate(d.getDate() + 1);
                            return d.toISOString().slice(0, 10);
                          })()
                        : "");
                      setRenewEnds("");
                    }}
                  >
                    Renovar
                  </button>
                  <button
                    type="button"
                    className={ghostButtonClass}
                    onClick={() => {
                      setShowEnd(true);
                      setActionReason("");
                    }}
                  >
                    Encerrar
                  </button>
                  <button
                    type="button"
                    className={ghostButtonClass}
                    onClick={() => {
                      setShowCancel(true);
                      setActionReason("");
                    }}
                  >
                    Cancelar
                  </button>
                </>
              ) : null}
              <button
                type="button"
                className={ghostButtonClass}
                onClick={() => setSelected(null)}
              >
                Fechar
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <h3 className="text-sm font-semibold text-lotus-900">Profissional</h3>
              <p className="mt-1 text-sm text-lotus-800">{selected.tenantName}</p>
              <p className="text-sm text-lotus-600">{selected.tenantSpecialty}</p>
            </div>
            <div>
              <h3 className="text-sm font-semibold text-lotus-900">Sala</h3>
              <p className="mt-1 text-sm text-lotus-800">
                {selected.roomCode ? `${selected.roomCode} — ` : ""}
                {selected.roomName ?? selected.roomId}
              </p>
            </div>
            <div>
              <h3 className="text-sm font-semibold text-lotus-900">Período</h3>
              <p className="mt-1 text-sm text-lotus-800">
                {formatDateBr(selected.startsOn)} → {formatDateBr(selected.endsOn)}
              </p>
              <p className="text-sm text-lotus-600">
                Duração: {durationLabel(selected.startsOn, selected.endsOn)}
              </p>
            </div>
            <div>
              <h3 className="text-sm font-semibold text-lotus-900">Financeiro</h3>
              <p className="mt-1 text-sm text-lotus-800">
                {formatRentBRL(selected.monthlyRentCents)} / mês
              </p>
              <p className="text-sm text-lotus-600">
                Vencimento: dia {selected.dueDay ?? "—"} · Água/luz/internet inclusos
              </p>
            </div>
          </div>

          {selected.notes ? (
            <div>
              <h3 className="text-sm font-semibold text-lotus-900">Observações</h3>
              <p className="mt-1 whitespace-pre-wrap text-sm text-lotus-800">
                {selected.notes}
              </p>
            </div>
          ) : null}

          {(selected.cancelReason || selected.endReason || selected.renewedFromId) && (
            <div className="text-sm text-lotus-700">
              {selected.endReason ? <p>Motivo encerramento: {selected.endReason}</p> : null}
              {selected.cancelReason ? (
                <p>Motivo cancelamento: {selected.cancelReason}</p>
              ) : null}
              {selected.renewedFromId ? (
                <p>Renovado a partir de: {selected.renewedFromId}</p>
              ) : null}
            </div>
          )}

          <div>
            <h3 className="text-sm font-semibold text-lotus-900">Histórico</h3>
            {events.length === 0 ? (
              <p className="mt-2 text-sm text-lotus-600">
                Sem eventos registrados (migration C057 necessária para histórico completo).
              </p>
            ) : (
              <ul className="mt-2 space-y-2">
                {events.map((ev) => (
                  <li
                    key={ev.id}
                    className="rounded-lg border border-lotus-100 px-3 py-2 text-sm text-lotus-800"
                  >
                    <span className="font-medium">
                      {EVENT_LABEL[ev.eventKind] ?? ev.eventKind}
                    </span>
                    <span className="text-lotus-500">
                      {" "}
                      · {formatDateTimeBr(ev.createdAt)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {showEnd ? (
            <div className="rounded-xl border border-lotus-200 bg-lotus-50/60 p-4">
              <p className="text-sm font-medium text-lotus-900">
                Confirmar encerramento? O registro será preservado.
              </p>
              <label className="mt-2 block text-sm text-lotus-800">
                Motivo (opcional)
                <input
                  className={fieldClass}
                  value={actionReason}
                  onChange={(e) => setActionReason(e.target.value)}
                />
              </label>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  className={buttonClass}
                  disabled={saving}
                  onClick={() => void confirmEnd()}
                >
                  Confirmar encerramento
                </button>
                <button
                  type="button"
                  className={ghostButtonClass}
                  onClick={() => setShowEnd(false)}
                >
                  Voltar
                </button>
              </div>
            </div>
          ) : null}

          {showCancel ? (
            <div className="rounded-xl border border-rose-200 bg-rose-50/60 p-4">
              <p className="text-sm font-medium text-rose-900">
                Cancelar contrato? Não exclui o histórico.
              </p>
              <label className="mt-2 block text-sm text-lotus-800">
                Motivo (obrigatório)
                <input
                  className={fieldClass}
                  value={actionReason}
                  onChange={(e) => setActionReason(e.target.value)}
                />
              </label>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  className={buttonClass}
                  disabled={saving}
                  onClick={() => void confirmCancel()}
                >
                  Confirmar cancelamento
                </button>
                <button
                  type="button"
                  className={ghostButtonClass}
                  onClick={() => setShowCancel(false)}
                >
                  Voltar
                </button>
              </div>
            </div>
          ) : null}

          {showRenew ? (
            <div className="rounded-xl border border-lotus-200 bg-white p-4">
              <p className="text-sm font-medium text-lotus-900">
                Renovação: encerra o contrato atual e cria um novo vinculado (histórico
                preservado).
              </p>
              <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label className="block text-sm text-lotus-800">
                  Novo início
                  <input
                    type="date"
                    className={fieldClass}
                    value={renewStarts}
                    onChange={(e) => setRenewStarts(e.target.value)}
                  />
                </label>
                <label className="block text-sm text-lotus-800">
                  Novo término
                  <input
                    type="date"
                    className={fieldClass}
                    value={renewEnds}
                    onChange={(e) => setRenewEnds(e.target.value)}
                  />
                </label>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  className={buttonClass}
                  disabled={saving}
                  onClick={() => void confirmRenew()}
                >
                  Confirmar renovação
                </button>
                <button
                  type="button"
                  className={ghostButtonClass}
                  onClick={() => setShowRenew(false)}
                >
                  Voltar
                </button>
              </div>
            </div>
          ) : null}
        </section>
      ) : null}

      {/* Form */}
      {formMode ? (
        <section className="card mt-6 space-y-4 p-4 sm:p-6">
          <h2 className="text-lg font-semibold text-lotus-900">
            {formMode === "create" ? "Novo contrato" : "Editar contrato"}
          </h2>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <label className="block text-sm text-lotus-800 md:col-span-2">
              Profissional (cadastro existente)
              <select
                className={fieldClass}
                value={form.professionalId}
                onChange={(e) => applyProfessional(e.target.value)}
              >
                <option value="">— Selecionar —</option>
                {professionals.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.fullName} · {p.specialty}
                    {p.practiceName ? ` · ${p.practiceName}` : ""}
                    {!p.isActive ? " (inativa)" : ""}
                  </option>
                ))}
              </select>
            </label>
            {form.professionalId ? (
              <div className="md:col-span-2 rounded-lg border border-lotus-100 bg-lotus-50/50 px-3 py-2 text-sm text-lotus-700">
                {(() => {
                  const p = professionals.find((x) => x.id === form.professionalId);
                  if (!p) return null;
                  return (
                    <>
                      Registro: {p.council} · Situação: {p.isActive ? "Ativa" : "Inativa"}
                      {p.practiceName ? ` · Practice: ${p.practiceName}` : ""}
                    </>
                  );
                })()}
              </div>
            ) : null}
            <label className="block text-sm text-lotus-800">
              Nome no contrato
              <input
                className={fieldClass}
                value={form.tenantName}
                onChange={(e) => setForm((f) => ({ ...f, tenantName: e.target.value }))}
              />
            </label>
            <label className="block text-sm text-lotus-800">
              Especialidade
              <input
                className={fieldClass}
                value={form.tenantSpecialty}
                onChange={(e) =>
                  setForm((f) => ({ ...f, tenantSpecialty: e.target.value }))
                }
              />
            </label>
            <label className="block text-sm text-lotus-800 md:col-span-2">
              Sala (sublet)
              <select
                className={fieldClass}
                value={form.roomId}
                onChange={(e) => setForm((f) => ({ ...f, roomId: e.target.value }))}
              >
                <option value="">— Selecionar —</option>
                {rooms.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.code} — {r.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm text-lotus-800">
              Início
              <input
                type="date"
                className={fieldClass}
                value={form.startsOn}
                onChange={(e) => setForm((f) => ({ ...f, startsOn: e.target.value }))}
              />
            </label>
            <label className="block text-sm text-lotus-800">
              Término
              <input
                type="date"
                className={fieldClass}
                value={form.endsOn}
                onChange={(e) => setForm((f) => ({ ...f, endsOn: e.target.value }))}
              />
            </label>
            <label className="block text-sm text-lotus-800">
              Valor mensal (R$)
              <input
                className={fieldClass}
                value={form.rentReais}
                onChange={(e) => setForm((f) => ({ ...f, rentReais: e.target.value }))}
                placeholder="2500,00"
                inputMode="decimal"
              />
            </label>
            <label className="block text-sm text-lotus-800">
              Dia de vencimento (1–28)
              <input
                className={fieldClass}
                value={form.dueDay}
                onChange={(e) => setForm((f) => ({ ...f, dueDay: e.target.value }))}
              />
            </label>
            <label className="block text-sm text-lotus-800 md:col-span-2">
              Observações / condições comerciais
              <textarea
                className={fieldClass}
                rows={3}
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              />
            </label>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className={buttonClass}
              disabled={saving}
              onClick={() => void submitForm()}
            >
              {saving ? "Salvando…" : "Salvar contrato"}
            </button>
            <button
              type="button"
              className={ghostButtonClass}
              onClick={() => setFormMode(null)}
            >
              Cancelar
            </button>
          </div>
        </section>
      ) : null}
    </div>
  );
}
