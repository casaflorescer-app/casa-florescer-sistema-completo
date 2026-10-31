"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { StatusMessage, fieldClass, ghostButtonClass } from "@/components/platform/Ui";
import {
  listClinicProfessionals,
  listHousePracticeOptions,
  listOrgProfileOptions,
  upsertClinicProfessional,
} from "@/lib/clinic-mgmt/professionals";
import { listClinicSpecialties } from "@/lib/clinic-mgmt/specialties";
import {
  PROFESSIONAL_CATEGORY_LABEL,
  type ClinicProfessional,
  type ClinicSpecialty,
  type ProfessionalCategory,
} from "@/lib/clinic-mgmt/types";
import { PageHeader } from "@/components/ui/PageHeader";
import { PrimaryCreateButton } from "@/components/ui/PrimaryCreateButton";
import { FormActions } from "@/components/ui/FormActions";
import { CreateFormShell } from "@/components/ui/CreateFormShell";
import { SearchField } from "@/components/ui/SearchField";
import { EmptyState } from "@/components/ui/EmptyState";
import { RowActions } from "@/components/ui/RowActions";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { EntityCombobox } from "@/components/ui/EntityCombobox";
import { friendlyError } from "@/lib/ui/friendly-error";

const CATEGORIES = Object.keys(PROFESSIONAL_CATEGORY_LABEL) as ProfessionalCategory[];

const COUNCIL_OPTIONS = ["CRM", "COREN", "CREFITO", "CRP", "CRN", "OUTRO"] as const;

const UF_OPTIONS = [
  "AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS","MG","PA","PB","PR","PE","PI","RJ","RN","RS","RO","RR","SC","SP","SE","TO",
];

type FormState = {
  displayName: string;
  category: ProfessionalCategory;
  councilType: string;
  councilNumber: string;
  councilUf: string;
  phone: string;
  email: string;
  notes: string;
  isActive: boolean;
  practiceId: string;
  profileId: string;
  profileLabel: string;
  specialtyIds: string[];
  primarySpecialtyId: string;
};

const EMPTY_FORM: FormState = {
  displayName: "",
  category: "medico",
  councilType: "CRM",
  councilNumber: "",
  councilUf: "",
  phone: "",
  email: "",
  notes: "",
  isActive: true,
  practiceId: "",
  profileId: "",
  profileLabel: "",
  specialtyIds: [],
  primarySpecialtyId: "",
};

export function ProfessionalsBoard() {
  const { authorization } = useAuth();
  const orgId = authorization?.profile?.organizationId ?? null;

  const [rows, setRows] = useState<ClinicProfessional[]>([]);
  const [specialties, setSpecialties] = useState<ClinicSpecialty[]>([]);
  const [practices, setPractices] = useState<Array<{ id: string; label: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [q, setQ] = useState("");
  const [filterCategory, setFilterCategory] = useState<ProfessionalCategory | "all">("all");
  const [filterSpecialty, setFilterSpecialty] = useState("");
  const [filterStatus, setFilterStatus] = useState<"all" | "active" | "inactive">("all");
  const [filterPractice, setFilterPractice] = useState("");

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<ClinicProfessional | null>(null);
  const [detail, setDetail] = useState<ClinicProfessional | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [confirmToggle, setConfirmToggle] = useState<ClinicProfessional | null>(null);

  const filtersActive =
    filterCategory !== "all" ||
    Boolean(filterSpecialty) ||
    filterStatus !== "all" ||
    Boolean(filterPractice);

  const reload = useCallback(async () => {
    if (!orgId) return;
    setLoading(true);
    setError(null);
    try {
      const [pros, specs, pracs] = await Promise.all([
        listClinicProfessionals(orgId, {
          q,
          category: filterCategory,
          specialtyId: filterSpecialty || null,
          status: filterStatus,
          practiceId: filterPractice || null,
        }),
        listClinicSpecialties(orgId, { activeOnly: true }),
        listHousePracticeOptions(orgId),
      ]);
      setRows(pros);
      setSpecialties(specs);
      setPractices(pracs);
    } catch (err) {
      setRows([]);
      setError(friendlyError(err, "Não foi possível carregar profissionais."));
    } finally {
      setLoading(false);
    }
  }, [orgId, q, filterCategory, filterSpecialty, filterStatus, filterPractice]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const searchProfiles = useCallback(
    async (query: string) => {
      if (!orgId) return [];
      return listOrgProfileOptions(orgId, query);
    },
    [orgId],
  );

  function resetForm(defaults?: Partial<FormState>) {
    setEditing(null);
    setForm({
      ...EMPTY_FORM,
      practiceId: practices[0]?.id ?? "",
      ...defaults,
    });
  }

  function closeForm() {
    setFormOpen(false);
    resetForm();
  }

  function startCreate() {
    setNotice(null);
    resetForm({ practiceId: practices[0]?.id ?? (filterPractice || "") });
    setFormOpen(true);
  }

  function startEdit(row: ClinicProfessional) {
    setEditing(row);
    setNotice(null);
    setForm({
      displayName: row.displayName,
      category: row.category,
      councilType: row.councilType || "CRM",
      councilNumber: row.councilNumber.startsWith("SN-") ? "" : row.councilNumber,
      councilUf: row.councilUf ?? "",
      phone: row.phone ?? "",
      email: row.email ?? "",
      notes: row.notes ?? "",
      isActive: row.isActive,
      practiceId: row.practiceId,
      profileId: row.profileId ?? "",
      profileLabel: row.profileName ?? "",
      specialtyIds: row.specialties.map((s) => s.id),
      primarySpecialtyId: row.specialties.find((s) => s.isPrimary)?.id ?? row.specialties[0]?.id ?? "",
    });
    setFormOpen(true);
  }

  function toggleSpecialty(id: string) {
    setForm((f) => {
      const has = f.specialtyIds.includes(id);
      const specialtyIds = has ? f.specialtyIds.filter((x) => x !== id) : [...f.specialtyIds, id];
      let primarySpecialtyId = f.primarySpecialtyId;
      if (has && primarySpecialtyId === id) primarySpecialtyId = specialtyIds[0] ?? "";
      if (!has && !primarySpecialtyId) primarySpecialtyId = id;
      return { ...f, specialtyIds, primarySpecialtyId };
    });
  }

  async function onSave() {
    if (!orgId) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await upsertClinicProfessional({
        organizationId: orgId,
        id: editing?.id,
        practiceId: form.practiceId,
        displayName: form.displayName,
        category: form.category,
        councilType: form.councilType,
        councilNumber: form.councilNumber,
        councilUf: form.councilUf,
        phone: form.phone,
        email: form.email,
        notes: form.notes,
        isActive: form.isActive,
        profileId: form.profileId || null,
        specialtyIds: form.specialtyIds,
        primarySpecialtyId: form.primarySpecialtyId || null,
      });
      setNotice(editing ? "Profissional atualizado." : "Profissional cadastrado.");
      closeForm();
      await reload();
    } catch (err) {
      setError(friendlyError(err, "Não foi possível salvar o profissional."));
    } finally {
      setBusy(false);
    }
  }

  async function applyToggle(row: ClinicProfessional) {
    if (!orgId) return;
    setBusy(true);
    setError(null);
    try {
      await upsertClinicProfessional({
        organizationId: orgId,
        id: row.id,
        practiceId: row.practiceId,
        displayName: row.displayName,
        category: row.category,
        councilType: row.councilType,
        councilNumber: row.councilNumber,
        councilUf: row.councilUf ?? undefined,
        phone: row.phone ?? undefined,
        email: row.email ?? undefined,
        notes: row.notes ?? undefined,
        isActive: !row.isActive,
        profileId: row.profileId,
        specialtyIds: row.specialties.map((s) => s.id),
        primarySpecialtyId: row.specialties.find((s) => s.isPrimary)?.id ?? null,
      });
      setNotice(row.isActive ? "Profissional inativado." : "Profissional ativado.");
      setConfirmToggle(null);
      await reload();
    } catch (err) {
      setError(friendlyError(err, "Não foi possível atualizar a situação."));
    } finally {
      setBusy(false);
    }
  }

  const specialtyNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const s of specialties) map.set(s.id, s.name);
    return map;
  }, [specialties]);

  return (
    <div className="min-w-0">
      <PageHeader
        eyebrow="Pessoas"
        title="Profissionais"
        description="Cadastre e gerencie os profissionais de saúde da casa. O cadastro é independente do login no sistema."
        actions={<PrimaryCreateButton label="Novo profissional" onClick={startCreate} />}
      />
      <StatusMessage error={error} notice={notice} />

      <div className="mt-6 space-y-3">
        <SearchField
          value={q}
          onChange={setQ}
          placeholder="Pesquisar por nome, registro, e-mail ou telefone…"
          aria-label="Pesquisar profissional"
          className="w-full max-w-none"
        />
        <div className="flex flex-wrap gap-2">
          <select
            className={fieldClass}
            value={filterCategory}
            onChange={(e) => setFilterCategory(e.target.value as ProfessionalCategory | "all")}
            aria-label="Filtrar categoria"
          >
            <option value="all">Todas as categorias</option>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {PROFESSIONAL_CATEGORY_LABEL[c]}
              </option>
            ))}
          </select>
          <select
            className={fieldClass}
            value={filterSpecialty}
            onChange={(e) => setFilterSpecialty(e.target.value)}
            aria-label="Filtrar especialidade"
          >
            <option value="">Todas as especialidades</option>
            {specialties.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <select
            className={fieldClass}
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value as "all" | "active" | "inactive")}
            aria-label="Filtrar situação"
          >
            <option value="all">Todas as situações</option>
            <option value="active">Ativos</option>
            <option value="inactive">Inativos</option>
          </select>
          {practices.length > 1 ? (
            <select
              className={fieldClass}
              value={filterPractice}
              onChange={(e) => setFilterPractice(e.target.value)}
              aria-label="Filtrar prática"
            >
              <option value="">Todas as práticas</option>
              {practices.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          ) : null}
          {filtersActive ? (
            <button
              type="button"
              className={ghostButtonClass}
              onClick={() => {
                setFilterCategory("all");
                setFilterSpecialty("");
                setFilterStatus("all");
                setFilterPractice("");
              }}
            >
              Limpar filtros
            </button>
          ) : null}
          <button type="button" className={ghostButtonClass} onClick={() => void reload()} disabled={loading}>
            Atualizar
          </button>
        </div>
      </div>

      {loading ? <p className="mt-6 text-sm text-lotus-600">Carregando profissionais…</p> : null}

      {!loading && rows.length === 0 ? (
        <div className="mt-6">
          <EmptyState
            title="Ainda não há profissionais cadastrados"
            description="Cadastre o primeiro profissional para disponibilizá-lo na agenda e nos atendimentos da clínica."
          />
        </div>
      ) : null}

      {!loading && rows.length > 0 ? (
        <>
          <ul className="mt-6 space-y-3 md:hidden">
            {rows.map((row) => (
              <li key={row.id}>
                <article className="card space-y-2">
                  <p className="font-semibold text-lotus-900">{row.displayName}</p>
                  <p className="text-sm text-lotus-700">
                    {PROFESSIONAL_CATEGORY_LABEL[row.category]} · {row.councilType}
                    {row.councilUf ? `/${row.councilUf}` : ""} {row.councilNumber}
                  </p>
                  <p className="text-sm text-lotus-600">
                    {row.specialties.map((s) => s.name).join(" · ") || "Sem especialidades"}
                  </p>
                  <p className="text-xs text-lotus-500">{row.isActive ? "Ativo" : "Inativo"}</p>
                  <RowActions
                    primary={{ id: "edit", label: "Editar", onClick: () => startEdit(row) }}
                    secondary={[
                      { id: "detail", label: "Ver detalhes", onClick: () => setDetail(row) },
                      {
                        id: "toggle",
                        label: row.isActive ? "Inativar" : "Ativar",
                        onClick: () => setConfirmToggle(row),
                      },
                    ]}
                  />
                </article>
              </li>
            ))}
          </ul>

          <div className="mt-6 hidden overflow-x-auto rounded-2xl border border-lotus-100 bg-white md:block">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-lotus-100 text-xs uppercase tracking-wide text-lotus-500">
                <tr>
                  <th className="px-4 py-3">Profissional</th>
                  <th className="px-4 py-3">Categoria</th>
                  <th className="px-4 py-3">Registro</th>
                  <th className="px-4 py-3">Especialidades</th>
                  <th className="px-4 py-3">Situação</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="border-b border-lotus-50">
                    <td className="px-4 py-3 font-medium text-lotus-900">{row.displayName}</td>
                    <td className="px-4 py-3">{PROFESSIONAL_CATEGORY_LABEL[row.category]}</td>
                    <td className="px-4 py-3">
                      {row.councilType}
                      {row.councilUf ? `/${row.councilUf}` : ""} {row.councilNumber}
                    </td>
                    <td className="px-4 py-3">
                      {row.specialties.map((s) => s.name).join(" · ") || "—"}
                    </td>
                    <td className="px-4 py-3">{row.isActive ? "Ativo" : "Inativo"}</td>
                    <td className="px-4 py-3 text-right">
                      <RowActions
                        primary={{ id: "edit", label: "Editar", onClick: () => startEdit(row) }}
                        secondary={[
                          { id: "detail", label: "Ver detalhes", onClick: () => setDetail(row) },
                          {
                            id: "toggle",
                            label: row.isActive ? "Inativar" : "Ativar",
                            onClick: () => setConfirmToggle(row),
                          },
                          {
                            id: "user",
                            label: row.profileId ? "Ver usuário vinculado" : "Sem usuário vinculado",
                            onClick: () => setDetail(row),
                          },
                        ]}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : null}

      <CreateFormShell
        open={formOpen}
        title={editing ? "Editar profissional" : "Novo profissional"}
        description="Cadastro clínico/operacional. Não cria login nem concede papéis."
        size="xl"
        busy={busy}
        onClose={closeForm}
        formId="professional-create-form"
      >
        <section className="space-y-3">
          <h3 className="text-sm font-semibold text-lotus-800">Identificação</h3>
          <label className="block text-sm">
            Nome completo
            <input
              className={fieldClass}
              value={form.displayName}
              onChange={(e) => setForm((f) => ({ ...f, displayName: e.target.value }))}
            />
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm">
              E-mail profissional
              <input
                className={fieldClass}
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              />
            </label>
            <label className="block text-sm">
              Telefone
              <input
                className={fieldClass}
                value={form.phone}
                onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
              />
            </label>
          </div>
        </section>

        <section className="mt-5 space-y-3">
          <h3 className="text-sm font-semibold text-lotus-800">Categoria e registro</h3>
          <label className="block text-sm">
            Categoria profissional
            <select
              className={fieldClass}
              value={form.category}
              onChange={(e) => setForm((f) => ({ ...f, category: e.target.value as ProfessionalCategory }))}
            >
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {PROFESSIONAL_CATEGORY_LABEL[c]}
                </option>
              ))}
            </select>
          </label>
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="block text-sm">
              Conselho
              <select
                className={fieldClass}
                value={form.councilType}
                onChange={(e) => setForm((f) => ({ ...f, councilType: e.target.value }))}
              >
                {COUNCIL_OPTIONS.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm">
              Número
              <input
                className={fieldClass}
                value={form.councilNumber}
                onChange={(e) => setForm((f) => ({ ...f, councilNumber: e.target.value }))}
                placeholder="Opcional se não houver registro"
              />
            </label>
            <label className="block text-sm">
              UF
              <select
                className={fieldClass}
                value={form.councilUf}
                onChange={(e) => setForm((f) => ({ ...f, councilUf: e.target.value }))}
              >
                <option value="">—</option>
                {UF_OPTIONS.map((uf) => (
                  <option key={uf} value={uf}>
                    {uf}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </section>

        <section className="mt-5 space-y-3">
          <h3 className="text-sm font-semibold text-lotus-800">Especialidades</h3>
          <p className="text-xs text-lotus-600">
            Cadastre novas em Pessoas → Especialidades. Aqui apenas vincula.
          </p>
          <ul className="max-h-40 space-y-1 overflow-y-auto rounded-xl border border-lotus-100 p-2">
            {specialties.length === 0 ? (
              <li className="text-sm text-lotus-600">Nenhuma especialidade ativa cadastrada.</li>
            ) : (
              specialties.map((s) => (
                <li key={s.id}>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={form.specialtyIds.includes(s.id)}
                      onChange={() => toggleSpecialty(s.id)}
                    />
                    {s.name}
                  </label>
                </li>
              ))
            )}
          </ul>
          {form.specialtyIds.length > 0 ? (
            <label className="block text-sm">
              Especialidade principal
              <select
                className={fieldClass}
                value={form.primarySpecialtyId}
                onChange={(e) => setForm((f) => ({ ...f, primarySpecialtyId: e.target.value }))}
              >
                {form.specialtyIds.map((id) => (
                  <option key={id} value={id}>
                    {specialtyNameById.get(id) ?? id}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
        </section>

        <section className="mt-5 space-y-3">
          <h3 className="text-sm font-semibold text-lotus-800">Clínica e acesso</h3>
          <label className="block text-sm">
            Prática
            <select
              className={fieldClass}
              value={form.practiceId}
              onChange={(e) => setForm((f) => ({ ...f, practiceId: e.target.value }))}
            >
              <option value="">Selecione…</option>
              {practices.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            Usuário do sistema (opcional)
            <EntityCombobox
              value={form.profileId}
              selectedLabel={form.profileLabel}
              onChange={(id, option) =>
                setForm((f) => ({
                  ...f,
                  profileId: id,
                  profileLabel: option?.label ?? "",
                }))
              }
              onSearch={searchProfiles}
              minChars={2}
              placeholder="Vincular profile existente (não cria login)…"
              emptyLabel="Nenhum usuário encontrado nesta organização."
            />
          </label>
          {form.profileId ? (
            <button
              type="button"
              className={`${ghostButtonClass} text-xs`}
              onClick={() => setForm((f) => ({ ...f, profileId: "", profileLabel: "" }))}
            >
              Remover vínculo com usuário
            </button>
          ) : (
            <p className="text-xs text-lotus-600">Este profissional não terá acesso ao sistema até vincular um usuário.</p>
          )}
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.isActive}
              onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))}
            />
            Ativo (disponível para novos agendamentos)
          </label>
          <label className="block text-sm">
            Observações
            <textarea
              className={fieldClass}
              rows={2}
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
            />
          </label>
        </section>

        <FormActions
          primaryLabel={editing ? "Salvar alterações" : "Salvar profissional"}
          primaryBusy={busy}
          primaryDisabled={!form.displayName.trim() || !form.practiceId}
          onPrimary={() => void onSave()}
          onCancel={closeForm}
        />
      </CreateFormShell>

      <CreateFormShell
        open={Boolean(detail)}
        title={detail?.displayName ?? "Profissional"}
        description="Consulta"
        size="lg"
        onClose={() => setDetail(null)}
      >
        {detail ? (
          <div className="space-y-4 text-sm text-lotus-800">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-lotus-500">Categoria</p>
              <p className="mt-1">{PROFESSIONAL_CATEGORY_LABEL[detail.category]}</p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-lotus-500">Registro</p>
              <p className="mt-1">
                {detail.councilType}
                {detail.councilUf ? `/${detail.councilUf}` : ""} {detail.councilNumber}
              </p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-lotus-500">Contato</p>
              <p className="mt-1">{detail.email || "—"} · {detail.phone || "—"}</p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-lotus-500">Especialidades</p>
              <p className="mt-1">
                {detail.specialties
                  .map((s) => (s.isPrimary ? `${s.name} (principal)` : s.name))
                  .join(" · ") || "—"}
              </p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-lotus-500">Prática</p>
              <p className="mt-1">{detail.practiceName ?? detail.practiceId}</p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-lotus-500">Usuário do sistema</p>
              <p className="mt-1">
                {detail.profileId
                  ? detail.profileName ?? detail.profileId
                  : "Nenhum — sem acesso ao sistema"}
              </p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-lotus-500">Situação</p>
              <p className="mt-1">{detail.isActive ? "Ativo" : "Inativo"}</p>
            </div>
            <FormActions
              primaryLabel="Editar"
              onPrimary={() => {
                const row = detail;
                setDetail(null);
                startEdit(row);
              }}
              onCancel={() => setDetail(null)}
              cancelLabel="Fechar"
            />
          </div>
        ) : null}
      </CreateFormShell>

      <ConfirmDialog
        open={Boolean(confirmToggle)}
        title={confirmToggle?.isActive ? "Inativar profissional?" : "Ativar profissional?"}
        description={
          confirmToggle?.isActive
            ? "O histórico de agenda e atendimentos será preservado. O profissional deixará de aparecer para novos agendamentos."
            : "O profissional voltará a ficar disponível para novos agendamentos."
        }
        confirmLabel={confirmToggle?.isActive ? "Inativar" : "Ativar"}
        danger={Boolean(confirmToggle?.isActive)}
        busy={busy}
        onConfirm={() => {
          if (confirmToggle) void applyToggle(confirmToggle);
        }}
        onCancel={() => setConfirmToggle(null)}
      />
    </div>
  );
}
