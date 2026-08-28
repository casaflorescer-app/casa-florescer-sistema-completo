"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/components/auth/AuthProvider";
import { createClient } from "@/lib/supabase/client";
import { formatGestationalAge, formatIsoDateBr } from "@/lib/patients/format";
import { formatDateTime } from "@/lib/platform/format";
import {
  activeBackupGrant,
  closePregnancy,
  describePregnancyEvent,
  effectiveEdd,
  getPregnancy,
  grantBackupAccess,
  listBackupGrants,
  listPregnancyEvents,
  listProfessionalLabels,
  listProfileNames,
  pregnancyLabel,
  PREGNANCY_EVENT_LABEL,
  PREGNANCY_RISK_LABEL,
  PREGNANCY_STATUS_LABEL,
  revokeBackupAccess,
  TERMINAL_PREGNANCY_STATUSES,
  type PregnancyBackupGrant,
  type PregnancyEventRow,
  type PregnancyRow,
} from "@/lib/pregnancies/directory";
import { StatusMessage, buttonClass, fieldClass, ghostButtonClass } from "@/components/platform/Ui";

export function PregnancyDetail({
  patientId,
  pregnancyId,
  updated = false,
}: {
  patientId: string;
  pregnancyId: string;
  updated?: boolean;
}) {
  const { authorization } = useAuth();
  const [row, setRow] = useState<PregnancyRow | null>(null);
  const [events, setEvents] = useState<PregnancyEventRow[]>([]);
  const [grants, setGrants] = useState<PregnancyBackupGrant[]>([]);
  const [eventNames, setEventNames] = useState<Map<string, string>>(new Map());
  const [actorNames, setActorNames] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(updated ? "Gestação atualizada." : null);
  const [closeStatus, setCloseStatus] = useState<(typeof TERMINAL_PREGNANCY_STATUSES)[number]>("closed");
  const [closeReason, setCloseReason] = useState("");
  const [closing, setClosing] = useState(false);
  const [showClose, setShowClose] = useState(false);
  const [grantBusy, setGrantBusy] = useState(false);

  const isPrincipal = Boolean(
    row &&
      authorization?.memberships.some((item) => item.professional?.id === row.primaryProfessionalId),
  );
  const currentGrant = useMemo(() => activeBackupGrant(grants), [grants]);

  async function load() {
    const supabase = createClient();
    if (!supabase) {
      setError("Autenticação não configurada neste ambiente.");
      return;
    }
    const [pregnancy, history, grantRows, labels] = await Promise.all([
      getPregnancy(supabase, pregnancyId),
      listPregnancyEvents(supabase, pregnancyId),
      listBackupGrants(supabase, pregnancyId),
      listProfessionalLabels(supabase),
    ]);
    if (!pregnancy || pregnancy.patientId !== patientId) {
      setRow(null);
      setEvents([]);
      setGrants([]);
      setError("Gestação não encontrada ou sem permissão para visualização.");
      return;
    }
    const names = new Map(labels.map((item) => [item.id, item.fullName]));
    if (pregnancy.primaryProfessionalId && pregnancy.primaryName) {
      names.set(pregnancy.primaryProfessionalId, pregnancy.primaryName);
    }
    if (pregnancy.backupProfessionalId && pregnancy.backupName) {
      names.set(pregnancy.backupProfessionalId, pregnancy.backupName);
    }
    const actors = await listProfileNames(supabase, [
      ...history.map((item) => item.actorId).filter((id): id is string => Boolean(id)),
      ...grantRows.flatMap((item) => [item.grantedBy, item.revokedBy]).filter((id): id is string => Boolean(id)),
    ]);
    setRow(pregnancy);
    setEvents(history);
    setGrants(grantRows);
    setEventNames(names);
    setActorNames(actors);
    setError(null);
  }

  useEffect(() => {
    setLoading(true);
    void load()
      .catch((err: unknown) => {
        setRow(null);
        setError(err instanceof Error ? err.message : "Não foi possível carregar a gestação.");
      })
      .finally(() => setLoading(false));
  }, [patientId, pregnancyId]);

  async function handleClose(event: React.FormEvent) {
    event.preventDefault();
    if (!row || closing) return;
    const supabase = createClient();
    if (!supabase) return;
    setClosing(true);
    setError(null);
    try {
      await closePregnancy(supabase, row.id, closeStatus, closeReason);
      setNotice("Acompanhamento atualizado.");
      setShowClose(false);
      setCloseReason("");
      await load();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Não foi possível encerrar a gestação.");
    } finally {
      setClosing(false);
    }
  }

  async function handleGrant() {
    if (!row || grantBusy) return;
    const supabase = createClient();
    if (!supabase) return;
    setGrantBusy(true);
    setError(null);
    try {
      await grantBackupAccess(supabase, row.id);
      setNotice("Acesso da médica de retaguarda autorizado para esta gestação.");
      await load();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Não foi possível autorizar o compartilhamento.");
    } finally {
      setGrantBusy(false);
    }
  }

  async function handleRevoke() {
    if (!row || grantBusy) return;
    const supabase = createClient();
    if (!supabase) return;
    setGrantBusy(true);
    setError(null);
    try {
      await revokeBackupAccess(supabase, row.id);
      setNotice("Autorização da retaguarda revogada. O histórico foi preservado.");
      await load();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Não foi possível revogar a autorização.");
    } finally {
      setGrantBusy(false);
    }
  }

  const patientHref = `/app/patients/${patientId}`;
  const inCare = row?.status === "in_care";

  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-lotus-500">Clínica</p>
      <h1 className="page-title mt-1">{row ? pregnancyLabel(row) : "Gestação"}</h1>
      <p className="page-sub mt-2">
        {row?.patientName ? `Paciente: ${row.patientName}. ` : null}
        Acompanhamento obstétrico sem dados comerciais nesta fase.
      </p>

      <div className="mt-6 flex flex-wrap gap-3">
        <Link href={patientHref} className={`${ghostButtonClass} inline-flex items-center`}>
          Voltar para a paciente
        </Link>
        {row && inCare ? (
          <Link
            href={`/app/patients/${patientId}/pregnancies/${pregnancyId}/edit`}
            className={`${buttonClass} inline-flex items-center`}
          >
            Editar
          </Link>
        ) : null}
        {row && inCare ? (
          <button type="button" className={ghostButtonClass} onClick={() => setShowClose((value) => !value)}>
            Encerrar acompanhamento
          </button>
        ) : null}
      </div>

      <StatusMessage error={error} notice={notice} />
      {loading ? <p className="mt-6 text-sm text-lotus-600">Carregando gestação…</p> : null}

      {!loading && row ? (
        <>
          {showClose && inCare ? (
            <form className="card mt-6 max-w-xl space-y-4" onSubmit={(event) => void handleClose(event)}>
              <h2 className="font-semibold text-lotus-900">Encerrar acompanhamento</h2>
              <p className="text-sm text-lotus-600">
                A gestação permanece no histórico. Motivo é obrigatório.
              </p>
              <div>
                <label htmlFor="close-status" className="text-sm font-medium text-lotus-800">
                  Situação
                </label>
                <select
                  id="close-status"
                  className={fieldClass}
                  value={closeStatus}
                  onChange={(event) =>
                    setCloseStatus(event.target.value as (typeof TERMINAL_PREGNANCY_STATUSES)[number])
                  }
                  disabled={closing}
                >
                  <option value="closed">Encerrada</option>
                  <option value="transferred">Transferida</option>
                  <option value="cancelled">Cancelada</option>
                </select>
              </div>
              <div>
                <label htmlFor="close-reason" className="text-sm font-medium text-lotus-800">
                  Motivo
                </label>
                <textarea
                  id="close-reason"
                  className={fieldClass}
                  rows={3}
                  value={closeReason}
                  onChange={(event) => setCloseReason(event.target.value)}
                  disabled={closing}
                  required
                  minLength={3}
                />
              </div>
              <div className="flex flex-wrap gap-3">
                <button type="submit" className={buttonClass} disabled={closing}>
                  {closing ? "Salvando…" : "Confirmar"}
                </button>
                <button
                  type="button"
                  className={ghostButtonClass}
                  disabled={closing}
                  onClick={() => setShowClose(false)}
                >
                  Cancelar
                </button>
              </div>
            </form>
          ) : null}

          <section className="card mt-6 max-w-xl" aria-labelledby="pregnancy-summary-title">
            <h2 id="pregnancy-summary-title" className="font-semibold text-lotus-900">
              Acompanhamento
            </h2>
            <dl className="mt-4 grid gap-4 text-sm text-lotus-800">
              <Item label="Paciente" value={row.patientName ?? "—"} strong />
              <Item label="Prática" value={row.practiceName ?? "—"} />
              <Item label="Médica principal" value={row.primaryName ?? "—"} />
              <Item label="Médica de retaguarda" value={row.backupName ?? "Não definida"} />
              <Item label="Status" value={PREGNANCY_STATUS_LABEL[row.status]} />
              {row.statusReason ? <Item label="Motivo do status" value={row.statusReason} /> : null}
              <Item
                label="Início do acompanhamento"
                value={row.careStartedOn ? formatIsoDateBr(row.careStartedOn) : "—"}
              />
            </dl>
          </section>

          <section className="card mt-6 max-w-xl" aria-labelledby="pregnancy-share-title">
            <h2 id="pregnancy-share-title" className="font-semibold text-lotus-900">
              Compartilhamento com a retaguarda
            </h2>
            <p className="mt-2 text-sm text-lotus-600">
              Cadastrar a retaguarda não libera o acesso. A médica principal autoriza expressamente
              somente esta gestação.
            </p>
            <dl className="mt-4 grid gap-4 text-sm text-lotus-800">
              <Item
                label="Situação"
                value={
                  !row.backupProfessionalId
                    ? "Sem médica de retaguarda"
                    : currentGrant
                      ? "Autorizado"
                      : "Não autorizado"
                }
              />
              {currentGrant ? (
                <Item
                  label="Autorizado em"
                  value={`${formatDateTime(currentGrant.grantedAt)}${
                    actorNames.get(currentGrant.grantedBy ?? "")
                      ? ` por ${actorNames.get(currentGrant.grantedBy ?? "")}`
                      : ""
                  }`}
                />
              ) : null}
            </dl>
            {isPrincipal && inCare && row.backupProfessionalId ? (
              <div className="mt-4 flex flex-wrap gap-3">
                {currentGrant ? (
                  <button type="button" className={ghostButtonClass} disabled={grantBusy} onClick={() => void handleRevoke()}>
                    {grantBusy ? "Salvando…" : "Revogar autorização"}
                  </button>
                ) : (
                  <button type="button" className={buttonClass} disabled={grantBusy} onClick={() => void handleGrant()}>
                    {grantBusy ? "Salvando…" : "Autorizar acesso da retaguarda"}
                  </button>
                )}
              </div>
            ) : null}
            {grants.length > 0 ? (
              <ol className="mt-4 space-y-2 text-sm">
                {grants.map((item) => (
                  <li key={item.id} className="rounded-xl border border-lotus-100 px-3 py-2">
                    <p className="font-medium text-lotus-900">
                      {item.revokedAt ? "Revogada" : "Vigente"} — {eventNames.get(item.backupProfessionalId) ?? "Retaguarda"}
                    </p>
                    <p className="mt-1 text-lotus-600">
                      Concedida em {formatDateTime(item.grantedAt)}
                      {item.grantedBy && actorNames.get(item.grantedBy)
                        ? ` por ${actorNames.get(item.grantedBy)}`
                        : ""}
                    </p>
                    {item.revokedAt ? (
                      <p className="mt-1 text-lotus-600">
                        Revogada em {formatDateTime(item.revokedAt)}
                        {item.revokedBy && actorNames.get(item.revokedBy)
                          ? ` por ${actorNames.get(item.revokedBy)}`
                          : ""}
                      </p>
                    ) : null}
                  </li>
                ))}
              </ol>
            ) : null}
          </section>

          <section className="card mt-6 max-w-xl" aria-labelledby="pregnancy-dates-title">
            <h2 id="pregnancy-dates-title" className="font-semibold text-lotus-900">
              Datas obstétricas
            </h2>
            <dl className="mt-4 grid gap-4 text-sm text-lotus-800">
              <Item label="Número da gestação" value={row.pregnancyNumber ? `${row.pregnancyNumber}ª` : "—"} />
              <Item label="DUM" value={row.lmpDate ? formatIsoDateBr(row.lmpDate) : "—"} />
              <Item
                label="DPP calculada"
                value={row.calculatedEdd ? formatIsoDateBr(row.calculatedEdd) : "—"}
              />
              <Item
                label="DPP ajustada / informada"
                value={row.clinicalEdd ? formatIsoDateBr(row.clinicalEdd) : "Não informada"}
              />
              <Item
                label="DPP de referência"
                value={effectiveEdd(row) ? formatIsoDateBr(effectiveEdd(row)!) : "—"}
              />
              <Item
                label="Idade gestacional"
                value={row.lmpDate ? formatGestationalAge(row.lmpDate) : "—"}
              />
              <Item
                label="Risco"
                value={row.risk ? PREGNANCY_RISK_LABEL[row.risk] : "Não definido"}
              />
              <Item label="Observações" value={row.notes ?? "—"} />
            </dl>
          </section>

          <section className="card mt-6 max-w-xl" aria-labelledby="pregnancy-history-title">
            <h2 id="pregnancy-history-title" className="font-semibold text-lotus-900">
              Histórico
            </h2>
            {events.length === 0 ? (
              <p className="mt-3 text-sm text-lotus-600">Nenhum evento registrado.</p>
            ) : (
              <ol className="mt-4 space-y-3">
                {events.map((item) => {
                  const detail = describePregnancyEvent(item, eventNames, actorNames);
                  return (
                    <li key={item.id} className="rounded-xl border border-lotus-100 px-3 py-3 text-sm">
                      <p className="font-medium text-lotus-900">
                        {PREGNANCY_EVENT_LABEL[item.kind] ?? item.kind}
                      </p>
                      <p className="mt-1 text-lotus-600">{formatDateTime(item.occurredAt)}</p>
                      {detail ? <p className="mt-2 text-lotus-800">{detail}</p> : null}
                    </li>
                  );
                })}
              </ol>
            )}
          </section>
        </>
      ) : null}
    </div>
  );
}

function Item({
  label,
  value,
  strong = false,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-lotus-500">{label}</dt>
      <dd className={`mt-1 ${strong ? "font-medium text-lotus-900" : ""}`}>{value}</dd>
    </div>
  );
}
