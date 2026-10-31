"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/components/auth/AuthProvider";
import { StatusMessage, buttonClass, fieldClass, ghostButtonClass } from "@/components/platform/Ui";
import {
  OBS_STATUS_LABEL,
  PROC_KIND_LABEL,
  PROC_STATUS_LABEL,
  type ObstetricAvailabilityContract,
  type ProcedureAgreement,
  type ProcedureAgreementKind,
} from "@/lib/clinic-mgmt/types";
import {
  acknowledgeProcedureAgreement,
  cancelProcedureAgreement,
  createObstetricContract,
  createProcedureAgreement,
  endObstetricContract,
  listObstetricContracts,
  listProcedureAgreements,
  obstetricDashboard,
} from "@/lib/clinic-mgmt/clinical-contracts";
import { createClient } from "@/lib/supabase/client";
import { EntityCombobox } from "@/components/ui/EntityCombobox";
import { PageHeader } from "@/components/ui/PageHeader";
import { PrimaryCreateButton } from "@/components/ui/PrimaryCreateButton";
import { FormActions } from "@/components/ui/FormActions";
import { CreateFormShell } from "@/components/ui/CreateFormShell";
import {
  searchPatientOptions,
  searchProfessionalOptions,
  searchProcedureOptions,
} from "@/lib/search/entity-search";

type Tab = "obstetric" | "procedure";

export function ClinicalContractsModule({ initialTab = "obstetric" }: { initialTab?: Tab }) {
  const { authorization } = useAuth();
  const orgId = authorization?.profile?.organizationId ?? null;
  const [tab, setTab] = useState<Tab>(initialTab);
  const [obs, setObs] = useState<ObstetricAvailabilityContract[]>([]);
  const [procs, setProcs] = useState<ProcedureAgreement[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [formOpen, setFormOpen] = useState(false);

  const [patientId, setPatientId] = useState("");
  const [patientName, setPatientName] = useState("");
  const [professionalId, setProfessionalId] = useState("");
  const [professionalName, setProfessionalName] = useState("");
  const [procedureId, setProcedureId] = useState("");
  const [normalBirth, setNormalBirth] = useState(true);
  const [cesarean, setCesarean] = useState(false);

  const [procName, setProcName] = useState("");
  const [procTitle, setProcTitle] = useState("Termo de ciência dos riscos");
  const [procKind, setProcKind] = useState<ProcedureAgreementKind>("risk_acknowledgment");
  const [procBody, setProcBody] = useState("");
  const [ackName, setAckName] = useState("");
  const supabase = useMemo(() => createClient(), []);

  const stats = useMemo(() => obstetricDashboard(obs), [obs]);

  const reload = useCallback(async () => {
    if (!orgId) return;
    setLoading(true);
    setError(null);
    try {
      const [o, p] = await Promise.all([
        listObstetricContracts(orgId, { q }),
        listProcedureAgreements(orgId, { q }),
      ]);
      setObs(o);
      setProcs(p);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível carregar contratos.");
      setObs([]);
      setProcs([]);
    } finally {
      setLoading(false);
    }
  }, [orgId, q]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const searchPatientsCb = useCallback(
    async (query: string) => {
      if (!supabase) return [];
      return searchPatientOptions(supabase, query, { limit: 30 });
    },
    [supabase],
  );
  const searchProfessionalsCb = useCallback(
    async (query: string) => {
      if (!supabase || !orgId) return [];
      return searchProfessionalOptions(supabase, query, {
        organizationId: orgId,
        limit: 30,
      });
    },
    [orgId, supabase],
  );
  const searchProceduresCb = useCallback(
    async (query: string) => {
      if (!supabase || !orgId) return [];
      return searchProcedureOptions(supabase, query, {
        organizationId: orgId,
        limit: 30,
      });
    },
    [orgId, supabase],
  );

  function resetCreateFields() {
    setPatientId("");
    setPatientName("");
    setProfessionalId("");
    setProfessionalName("");
    setProcedureId("");
    setNormalBirth(true);
    setCesarean(false);
    setProcName("");
    setProcTitle("Termo de ciência dos riscos");
    setProcKind("risk_acknowledgment");
    setProcBody("");
  }

  function closeForm() {
    setFormOpen(false);
    resetCreateFields();
  }

  function openCreate() {
    resetCreateFields();
    setFormOpen(true);
  }

  async function onCreateObs() {
    if (!orgId || !patientId || !professionalId) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await createObstetricContract({
        organizationId: orgId,
        patientId,
        professionalId,
        includesNormalBirth: normalBirth,
        includesCesarean: cesarean,
      });
      setNotice("Contrato obstétrico criado.");
      closeForm();
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao criar contrato.");
    } finally {
      setBusy(false);
    }
  }

  async function onCreateProc() {
    if (!orgId || !patientId || !procName.trim() || !procTitle.trim()) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await createProcedureAgreement({
        organizationId: orgId,
        patientId,
        procedureName: procName,
        title: procTitle,
        agreementKind: procKind,
        termBody: procBody,
        professionalId: professionalId || undefined,
      });
      setNotice("Termo/contrato de procedimento criado.");
      closeForm();
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao criar termo.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <PageHeader
        eyebrow="Gestão"
        title="Contratos clínicos"
        description="Distintos da locação de sala. Contrato obstétrico ≠ pré-natal. Locação permanece em Salas e Locações → Contratos."
        actions={
          <PrimaryCreateButton
            label={tab === "obstetric" ? "Novo contrato" : "Novo termo"}
            onClick={openCreate}
          />
        }
      />
      <p className="mt-1 text-sm text-lotus-600">
        Locação:{" "}
        <Link className="underline" href="/app/rentals?tab=contracts">
          Contratos de locação
        </Link>
        .
      </p>
      <StatusMessage error={error} notice={notice} />

      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" className={tab === "obstetric" ? buttonClass : ghostButtonClass} onClick={() => setTab("obstetric")}>
          Disponibilidade obstétrica
        </button>
        <button type="button" className={tab === "procedure" ? buttonClass : ghostButtonClass} onClick={() => setTab("procedure")}>
          Procedimentos / termos
        </button>
      </div>

      {tab === "obstetric" ? (
        <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
          {[
            ["Total", stats.total],
            ["Ativos", stats.active],
            ["Encerrados", stats.ended],
            ["Cancelados", stats.cancelled],
            ["Parto normal", stats.withNormal],
            ["Cesariana", stats.withCesarean],
          ].map(([label, value]) => (
            <div key={String(label)} className="card">
              <p className="text-xs uppercase tracking-wide text-lotus-500">{label}</p>
              <p className="mt-1 text-xl font-semibold text-lotus-900">{value}</p>
            </div>
          ))}
        </div>
      ) : null}

      <section className="mt-6 min-w-0">
        <div className="flex flex-wrap gap-2">
          <input
            className={fieldClass}
            placeholder="Pesquisar paciente, profissional ou código"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <button type="button" className={ghostButtonClass} onClick={() => void reload()}>
            Atualizar
          </button>
        </div>
        {loading ? <p className="mt-4 text-sm text-lotus-600">Carregando…</p> : null}

        {tab === "obstetric" ? (
          <ul className="mt-4 space-y-3">
            {obs.map((row) => (
              <li key={row.id}>
                <article className="card">
                  <p className="font-semibold text-lotus-900">
                    {row.contractCode ?? "Contrato"} · {row.patientName ?? row.patientId}
                  </p>
                  <p className="mt-1 text-sm text-lotus-700">
                    {row.professionalName ?? "—"} · {OBS_STATUS_LABEL[row.status]} ·{" "}
                    {[row.includesNormalBirth ? "Parto normal" : null, row.includesCesarean ? "Cesariana" : null]
                      .filter(Boolean)
                      .join(" + ")}
                  </p>
                  <div className="mt-2 text-sm">
                    <Link className="underline" href={`/app/patients/${row.patientId}`}>
                      Abrir paciente
                    </Link>
                  </div>
                  {row.status === "active" || row.status === "draft" ? (
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        type="button"
                        className={ghostButtonClass}
                        disabled={busy}
                        onClick={() =>
                          void endObstetricContract({
                            organizationId: orgId!,
                            id: row.id,
                            op: "end",
                            reason: "Encerrado via Gestão Clínica",
                          }).then(reload)
                        }
                      >
                        Encerrar
                      </button>
                      <button
                        type="button"
                        className={ghostButtonClass}
                        disabled={busy}
                        onClick={() =>
                          void endObstetricContract({
                            organizationId: orgId!,
                            id: row.id,
                            op: "cancel",
                            reason: "Cancelado via Gestão Clínica",
                          }).then(reload)
                        }
                      >
                        Cancelar
                      </button>
                    </div>
                  ) : null}
                </article>
              </li>
            ))}
            {!loading && obs.length === 0 ? (
              <p className="card text-sm text-lotus-700">Nenhum contrato obstétrico encontrado.</p>
            ) : null}
          </ul>
        ) : (
          <ul className="mt-4 space-y-3">
            {procs.map((row) => (
              <li key={row.id}>
                <article className="card">
                  <p className="font-semibold text-lotus-900">
                    {row.title} · v{row.versionNumber}
                  </p>
                  <p className="mt-1 text-sm text-lotus-700">
                    {row.patientName ?? row.patientId} · {row.procedureName} ·{" "}
                    {PROC_KIND_LABEL[row.agreementKind]} · {PROC_STATUS_LABEL[row.status]}
                  </p>
                  {row.acknowledgedAt ? (
                    <p className="mt-1 text-xs text-lotus-600">
                      Ciência registrada em {new Date(row.acknowledgedAt).toLocaleString("pt-BR")}
                      {row.acknowledgedByName ? ` por ${row.acknowledgedByName}` : ""}
                    </p>
                  ) : null}
                  <div className="mt-2 text-sm">
                    <Link className="underline" href={`/app/patients/${row.patientId}`}>
                      Abrir paciente
                    </Link>
                  </div>
                  {row.status === "draft" ? (
                    <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-end">
                      <label className="block flex-1 text-sm">
                        Quem registrou a ciência
                        <input
                          className={fieldClass}
                          value={ackName}
                          onChange={(e) => setAckName(e.target.value)}
                          placeholder="Nome do responsável pelo registro"
                        />
                      </label>
                      <button
                        type="button"
                        className={buttonClass}
                        disabled={busy || !ackName.trim()}
                        onClick={() =>
                          void acknowledgeProcedureAgreement({
                            organizationId: orgId!,
                            id: row.id,
                            acknowledgedByName: ackName,
                          })
                            .then(() => {
                              setNotice("Ciência registrada.");
                              setAckName("");
                              return reload();
                            })
                            .catch((err: unknown) =>
                              setError(err instanceof Error ? err.message : "Falha ao registrar ciência."),
                            )
                        }
                      >
                        Registrar ciência
                      </button>
                      <button
                        type="button"
                        className={ghostButtonClass}
                        disabled={busy}
                        onClick={() =>
                          void cancelProcedureAgreement({
                            organizationId: orgId!,
                            id: row.id,
                            reason: "Cancelado",
                          }).then(reload)
                        }
                      >
                        Cancelar
                      </button>
                    </div>
                  ) : null}
                </article>
              </li>
            ))}
            {!loading && procs.length === 0 ? (
              <p className="card text-sm text-lotus-700">Nenhum termo/contrato de procedimento encontrado.</p>
            ) : null}
          </ul>
        )}
      </section>

      <CreateFormShell
        open={formOpen}
        title={tab === "obstetric" ? "Novo contrato obstétrico" : "Novo termo / contrato"}
        description="Paciente obrigatória. Não cria decisão clínica."
        size="xl"
        busy={busy}
        onClose={closeForm}
        formId="clinical-contract-form"
      >
        <label className="block text-sm">
          Paciente
          <EntityCombobox
            value={patientId}
            selectedLabel={patientName}
            onChange={(id, option) => {
              setPatientId(id);
              setPatientName(option?.label ?? "");
            }}
            onSearch={searchPatientsCb}
            minChars={2}
            placeholder="Digite o nome, CPF ou telefone…"
            emptyLabel="Nenhum paciente encontrado."
          />
        </label>
        <label className="mt-3 block text-sm">
          Profissional
          <EntityCombobox
            value={professionalId}
            selectedLabel={professionalName}
            onChange={(id, option) => {
              setProfessionalId(id);
              setProfessionalName(option?.label ?? "");
            }}
            onSearch={searchProfessionalsCb}
            minChars={2}
            placeholder="Nome ou registro profissional…"
            emptyLabel="Nenhum profissional encontrado."
          />
        </label>

        {tab === "obstetric" ? (
          <>
            <label className="mt-3 flex items-center gap-2 text-sm">
              <input type="checkbox" checked={normalBirth} onChange={(e) => setNormalBirth(e.target.checked)} />
              Parto normal
            </label>
            <label className="mt-2 flex items-center gap-2 text-sm">
              <input type="checkbox" checked={cesarean} onChange={(e) => setCesarean(e.target.checked)} />
              Cesariana
            </label>
            <FormActions
              primaryLabel="Criar contrato"
              primaryBusy={busy}
              primaryDisabled={!patientId || !professionalId || (!normalBirth && !cesarean)}
              onPrimary={() => void onCreateObs()}
              onCancel={closeForm}
            />
          </>
        ) : (
          <>
            <label className="mt-3 block text-sm">
              Procedimento
              <EntityCombobox
                value={procedureId}
                selectedLabel={procName}
                onChange={(id, option) => {
                  setProcedureId(id);
                  setProcName(option?.label ?? "");
                  if (option?.label && !procTitle.trim()) {
                    setProcTitle(`Termo — ${option.label}`);
                  }
                }}
                onSearch={searchProceduresCb}
                minChars={2}
                placeholder="Nome ou código do procedimento…"
                emptyLabel="Nenhum procedimento encontrado."
              />
            </label>
            <label className="mt-3 block text-sm">
              Tipo
              <select
                className={fieldClass}
                value={procKind}
                onChange={(e) => setProcKind(e.target.value as ProcedureAgreementKind)}
              >
                <option value="risk_acknowledgment">Termo de ciência dos riscos</option>
                <option value="procedure_contract">Contrato de procedimento</option>
                <option value="other">Outro</option>
              </select>
            </label>
            <label className="mt-3 block text-sm">
              Título
              <input className={fieldClass} value={procTitle} onChange={(e) => setProcTitle(e.target.value)} />
            </label>
            <label className="mt-3 block text-sm">
              Conteúdo do termo (texto administrativo)
              <textarea
                className={fieldClass}
                rows={4}
                value={procBody}
                onChange={(e) => setProcBody(e.target.value)}
                placeholder="Texto configurável. Não afirma validade jurídica específica."
              />
            </label>
            <FormActions
              primaryLabel="Criar termo"
              primaryBusy={busy}
              primaryDisabled={!patientId || !procName.trim() || !procTitle.trim()}
              onPrimary={() => void onCreateProc()}
              onCancel={closeForm}
            />
          </>
        )}
      </CreateFormShell>
    </div>
  );
}
