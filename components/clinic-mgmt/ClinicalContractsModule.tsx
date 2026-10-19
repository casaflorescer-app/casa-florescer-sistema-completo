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

type Tab = "obstetric" | "procedure";

type PatientHit = { id: string; fullName: string };
type ProfessionalHit = { id: string; fullName: string };

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

  const [patientQuery, setPatientQuery] = useState("");
  const [patientHits, setPatientHits] = useState<PatientHit[]>([]);
  const [patientId, setPatientId] = useState("");
  const [patientName, setPatientName] = useState("");
  const [professionals, setProfessionals] = useState<ProfessionalHit[]>([]);
  const [professionalId, setProfessionalId] = useState("");
  const [normalBirth, setNormalBirth] = useState(true);
  const [cesarean, setCesarean] = useState(false);

  const [procName, setProcName] = useState("");
  const [procTitle, setProcTitle] = useState("Termo de ciência dos riscos");
  const [procKind, setProcKind] = useState<ProcedureAgreementKind>("risk_acknowledgment");
  const [procBody, setProcBody] = useState("");
  const [ackName, setAckName] = useState("");

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

  useEffect(() => {
    const supabase = createClient();
    if (!supabase || !orgId) return;
    void supabase
      .from("professionals")
      .select("id, profiles(full_name)")
      .eq("organization_id", orgId)
      .then(({ data }) => {
        const rows = (data ?? []).flatMap((item) => {
          const r = item as Record<string, unknown>;
          const id = typeof r.id === "string" ? r.id : null;
          const profile = Array.isArray(r.profiles) ? r.profiles[0] : r.profiles;
          const fullName =
            profile && typeof profile === "object" && typeof (profile as { full_name?: unknown }).full_name === "string"
              ? String((profile as { full_name: string }).full_name)
              : "";
          if (!id || !fullName) return [];
          return [{ id, fullName }];
        });
        setProfessionals(rows);
        if (!professionalId && rows[0]) setProfessionalId(rows[0].id);
      });
  }, [orgId, professionalId]);

  async function searchPatients() {
    const supabase = createClient();
    if (!supabase || !orgId || !patientQuery.trim()) return;
    const { data, error: err } = await supabase
      .from("patients")
      .select("id, full_name")
      .eq("organization_id", orgId)
      .ilike("full_name", `%${patientQuery.trim()}%`)
      .limit(8);
    if (err) {
      setError("Não foi possível pesquisar pacientes.");
      return;
    }
    setPatientHits(
      (data ?? []).map((row) => ({
        id: String((row as { id: string }).id),
        fullName: String((row as { full_name: string }).full_name),
      })),
    );
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
      setPatientId("");
      setPatientName("");
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
      setProcName("");
      setProcBody("");
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao criar termo.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-lotus-500">Gestão Clínica</p>
      <h1 className="page-title mt-1">Contratos clínicos</h1>
      <p className="page-sub mt-2">
        Distintos da locação de sala. Contrato obstétrico ≠ pré-natal. Termo de riscos ≠ checkbox.
        Locação permanece em{" "}
        <Link className="underline" href="/app/rentals?tab=contracts">
          Aluguéis / Contratos
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

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <section>
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

        <aside className="card h-fit">
          <h2 className="text-base font-semibold text-lotus-900">
            {tab === "obstetric" ? "Novo contrato obstétrico" : "Novo termo / contrato"}
          </h2>
          <p className="mt-1 text-xs text-lotus-600">Paciente obrigatória. Não cria decisão clínica.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <input
              className={fieldClass}
              placeholder="Buscar paciente"
              value={patientQuery}
              onChange={(e) => setPatientQuery(e.target.value)}
            />
            <button type="button" className={ghostButtonClass} onClick={() => void searchPatients()}>
              Buscar
            </button>
          </div>
          {patientName ? <p className="mt-2 text-sm text-lotus-800">Selecionada: {patientName}</p> : null}
          <ul className="mt-2 space-y-1 text-sm">
            {patientHits.map((hit) => (
              <li key={hit.id}>
                <button
                  type="button"
                  className={ghostButtonClass}
                  onClick={() => {
                    setPatientId(hit.id);
                    setPatientName(hit.fullName);
                  }}
                >
                  {hit.fullName}
                </button>
              </li>
            ))}
          </ul>
          <label className="mt-3 block text-sm">
            Profissional
            <select
              className={fieldClass}
              value={professionalId}
              onChange={(e) => setProfessionalId(e.target.value)}
            >
              {professionals.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.fullName}
                </option>
              ))}
            </select>
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
              <button
                type="button"
                className={`${buttonClass} mt-4`}
                disabled={busy || !patientId || (!normalBirth && !cesarean)}
                onClick={() => void onCreateObs()}
              >
                {busy ? "Salvando…" : "Criar contrato"}
              </button>
            </>
          ) : (
            <>
              <label className="mt-3 block text-sm">
                Procedimento
                <input className={fieldClass} value={procName} onChange={(e) => setProcName(e.target.value)} />
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
              <button
                type="button"
                className={`${buttonClass} mt-4`}
                disabled={busy || !patientId || !procName.trim() || !procTitle.trim()}
                onClick={() => void onCreateProc()}
              >
                {busy ? "Salvando…" : "Criar termo"}
              </button>
            </>
          )}
        </aside>
      </div>
    </div>
  );
}
