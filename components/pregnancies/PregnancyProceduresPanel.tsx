"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { createClient } from "@/lib/supabase/client";
import {
  canEditProcedurePayoutNotes,
  canManageProcedurePayout,
} from "@/lib/auth/access";
import { formatIsoDateBr } from "@/lib/patients/format";
import { formatDateTime } from "@/lib/platform/format";
import { centsToReaisInput, formatCentsBRL } from "@/lib/policies/money";
import {
  OBSTETRIC_BIRTH_CODE,
  PAYOUT_STATUS_LABEL,
  activePayout,
  authCanManagePayoutsForPregnancy,
  authCanViewPayoutsForPregnancy,
  canOfferPayoutForProcedure,
  cancelPayout,
  createPregnancyProcedure,
  createPregnancyProcedurePayout,
  listPayoutEvents,
  listPayoutLedger,
  listPregnancyProcedurePayouts,
  listPregnancyProcedures,
  procedureLabel,
  settlePayout,
  updatePayoutAmount,
  updatePayoutNotes,
  type LedgerEntryRow,
  type PayoutEventRow,
  type PregnancyProcedurePayoutRow,
  type PregnancyProcedureRow,
} from "@/lib/procedures/directory";
import { StatusMessage, buttonClass, fieldClass, ghostButtonClass } from "@/components/platform/Ui";

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function statusTone(status: PregnancyProcedurePayoutRow["status"]): string {
  if (status === "settled") return "bg-emerald-50 text-emerald-900 border-emerald-200";
  if (status === "cancelled") return "bg-stone-100 text-stone-700 border-stone-200";
  return "bg-amber-50 text-amber-950 border-amber-200";
}

function eventLabel(kind: string): string {
  switch (kind) {
    case "created":
      return "Criação";
    case "notes_updated":
      return "Observação atualizada";
    case "amount_updated":
      return "Valor atualizado";
    case "settled":
      return "Efetivação";
    case "cancelled":
      return "Cancelamento";
    case "effective_on_updated":
      return "Data efetiva atualizada";
    default:
      return kind;
  }
}

export function PregnancyProceduresPanel({
  pregnancyId,
  practiceId,
  primaryProfessionalId,
  backupProfessionalId,
  primaryName,
  backupName,
  nameByProfessionalId,
}: {
  pregnancyId: string;
  practiceId: string;
  primaryProfessionalId: string;
  backupProfessionalId: string | null;
  primaryName: string | null;
  backupName: string | null;
  nameByProfessionalId: Map<string, string>;
}) {
  const { authorization } = useAuth();
  const [procedures, setProcedures] = useState<PregnancyProcedureRow[]>([]);
  const [payouts, setPayouts] = useState<PregnancyProcedurePayoutRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [showCreate, setShowCreate] = useState(false);
  const [performedBy, setPerformedBy] = useState(primaryProfessionalId);
  const [performedAt, setPerformedAt] = useState(todayIso());
  const [procedureNotes, setProcedureNotes] = useState("");

  const [payoutForProcedureId, setPayoutForProcedureId] = useState<string | null>(null);
  const [payoutAmount, setPayoutAmount] = useState("");
  const [payoutNotes, setPayoutNotes] = useState("");

  const [expandedPayoutId, setExpandedPayoutId] = useState<string | null>(null);
  const [events, setEvents] = useState<PayoutEventRow[]>([]);
  const [ledger, setLedger] = useState<LedgerEntryRow[]>([]);
  const [editNotes, setEditNotes] = useState("");
  const [editAmount, setEditAmount] = useState("");
  const [settleDate, setSettleDate] = useState(todayIso());
  const [cancelReason, setCancelReason] = useState("");

  const isPrincipal = Boolean(
    authorization?.memberships.some(
      (item) => item.professional?.id === primaryProfessionalId,
    ),
  );
  const isBackup = Boolean(
    backupProfessionalId &&
      authorization?.memberships.some(
        (item) => item.professional?.id === backupProfessionalId,
      ),
  );
  const canCreateProcedure = isPrincipal || isBackup;
  const canViewPayout = authCanViewPayoutsForPregnancy(
    authorization,
    practiceId,
    primaryProfessionalId,
    backupProfessionalId,
  );
  const canManagePayout = authCanManagePayoutsForPregnancy(
    authorization,
    practiceId,
    primaryProfessionalId,
  );

  async function load() {
    const supabase = createClient();
    if (!supabase) {
      setError("Autenticação não configurada neste ambiente.");
      setLoading(false);
      return;
    }
    const nextProcedures = await listPregnancyProcedures(
      supabase,
      pregnancyId,
      nameByProfessionalId,
    );
    setProcedures(nextProcedures);
    if (canViewPayout) {
      setPayouts(await listPregnancyProcedurePayouts(supabase, pregnancyId));
    } else {
      setPayouts([]);
    }
    setError(null);
    setLoading(false);
  }

  useEffect(() => {
    setLoading(true);
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pregnancyId, canViewPayout]);

  useEffect(() => {
    if (isPrincipal) setPerformedBy(primaryProfessionalId);
    else if (isBackup && backupProfessionalId) setPerformedBy(backupProfessionalId);
  }, [isPrincipal, isBackup, primaryProfessionalId, backupProfessionalId]);

  const performerOptions = useMemo(() => {
    const options: { id: string; label: string }[] = [
      { id: primaryProfessionalId, label: primaryName ? `${primaryName} (principal)` : "Médica principal" },
    ];
    if (isPrincipal && backupProfessionalId) {
      options.push({
        id: backupProfessionalId,
        label: backupName ? `${backupName} (retaguarda)` : "Médica retaguarda",
      });
    }
    return options;
  }, [
    isPrincipal,
    primaryProfessionalId,
    backupProfessionalId,
    primaryName,
    backupName,
  ]);

  async function onCreateProcedure(event: FormEvent) {
    event.preventDefault();
    const supabase = createClient();
    if (!supabase) return;
    setBusy(true);
    setNotice(null);
    const result = await createPregnancyProcedure(supabase, {
      pregnancyId,
      procedureCode: OBSTETRIC_BIRTH_CODE,
      performedByProfessionalId: performedBy,
      performedAt,
      notes: procedureNotes,
    });
    setBusy(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setShowCreate(false);
    setProcedureNotes("");
    setNotice("Procedimento registrado.");
    await load();
  }

  async function onCreatePayout(event: FormEvent) {
    event.preventDefault();
    if (!payoutForProcedureId) return;
    const supabase = createClient();
    if (!supabase) return;
    setBusy(true);
    setNotice(null);
    const result = await createPregnancyProcedurePayout(supabase, {
      pregnancyProcedureId: payoutForProcedureId,
      amountReais: payoutAmount,
      notes: payoutNotes,
    });
    setBusy(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setPayoutForProcedureId(null);
    setPayoutAmount("");
    setPayoutNotes("");
    setNotice("Repasse criado como pendente.");
    await load();
  }

  async function openPayoutDetail(payout: PregnancyProcedurePayoutRow) {
    const supabase = createClient();
    if (!supabase) return;
    setExpandedPayoutId(payout.id);
    setEditNotes(payout.notes ?? "");
    setEditAmount(centsToReaisInput(payout.amountCents));
    setSettleDate(payout.effectiveOn ?? todayIso());
    setCancelReason("");
    const [nextEvents, nextLedger] = await Promise.all([
      listPayoutEvents(supabase, payout.id),
      listPayoutLedger(supabase, payout.id),
    ]);
    setEvents(nextEvents);
    setLedger(nextLedger);
  }

  async function onSaveNotes(payoutId: string) {
    const supabase = createClient();
    if (!supabase) return;
    setBusy(true);
    const err = await updatePayoutNotes(supabase, payoutId, editNotes);
    setBusy(false);
    if (err) {
      setError(err);
      return;
    }
    setNotice("Observação atualizada.");
    await load();
    const payout = payouts.find((item) => item.id === payoutId);
    if (payout) await openPayoutDetail({ ...payout, notes: editNotes });
  }

  async function onSaveAmount(payoutId: string) {
    const supabase = createClient();
    if (!supabase) return;
    setBusy(true);
    const err = await updatePayoutAmount(supabase, payoutId, editAmount);
    setBusy(false);
    if (err) {
      setError(err);
      return;
    }
    setNotice("Valor atualizado.");
    await load();
  }

  async function onSettle(payoutId: string) {
    if (!window.confirm("Confirmar efetivação do repasse? O valor ficará bloqueado.")) {
      return;
    }
    const supabase = createClient();
    if (!supabase) return;
    setBusy(true);
    const err = await settlePayout(supabase, payoutId, settleDate);
    setBusy(false);
    if (err) {
      setError(err);
      return;
    }
    setNotice("Repasse efetivado.");
    await load();
    const updated = (await listPregnancyProcedurePayouts(supabase, pregnancyId)).find(
      (item) => item.id === payoutId,
    );
    if (updated) await openPayoutDetail(updated);
  }

  async function onCancel(payoutId: string) {
    if (
      !window.confirm(
        "Cancelar este repasse? O histórico e o valor anteriores serão preservados.",
      )
    ) {
      return;
    }
    const supabase = createClient();
    if (!supabase) return;
    setBusy(true);
    const err = await cancelPayout(supabase, payoutId, cancelReason);
    setBusy(false);
    if (err) {
      setError(err);
      return;
    }
    setNotice("Repasse cancelado.");
    await load();
    const updated = (await listPregnancyProcedurePayouts(supabase, pregnancyId)).find(
      (item) => item.id === payoutId,
    );
    if (updated) await openPayoutDetail(updated);
  }

  return (
    <section className="card mt-6" aria-labelledby="pregnancy-procedures-title">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="pregnancy-procedures-title" className="font-semibold text-lotus-900">
            Procedimentos
          </h2>
          <p className="mt-1 text-sm text-lotus-600">
            Registro clínico na gestação. O repasse à retaguarda é opcional e separado da política
            de atendimento.
          </p>
        </div>
        {canCreateProcedure ? (
          <button
            type="button"
            className={buttonClass}
            onClick={() => setShowCreate((value) => !value)}
          >
            {showCreate ? "Fechar" : "Registrar parto obstétrico"}
          </button>
        ) : null}
      </div>

      {notice || error ? (
        <div className="mt-4">
          <StatusMessage error={error} notice={notice} />
        </div>
      ) : null}

      {showCreate ? (
        <form className="mt-4 space-y-3 rounded-xl border border-lotus-100 p-4" onSubmit={onCreateProcedure}>
          <p className="text-sm font-medium text-lotus-900">Parto obstétrico</p>
          <label className="block text-sm text-lotus-800">
            Realizado por
            <select
              className={`${fieldClass} mt-1`}
              value={performedBy}
              onChange={(event) => setPerformedBy(event.target.value)}
              disabled={!isPrincipal || performerOptions.length < 2}
              required
            >
              {performerOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm text-lotus-800">
            Data do procedimento
            <input
              type="date"
              className={`${fieldClass} mt-1`}
              value={performedAt}
              onChange={(event) => setPerformedAt(event.target.value)}
              required
            />
          </label>
          <label className="block text-sm text-lotus-800">
            Observações
            <textarea
              className={`${fieldClass} mt-1`}
              rows={3}
              value={procedureNotes}
              onChange={(event) => setProcedureNotes(event.target.value)}
            />
          </label>
          <button type="submit" className={buttonClass} disabled={busy}>
            Salvar procedimento
          </button>
        </form>
      ) : null}

      {loading ? (
        <p className="mt-4 text-sm text-lotus-600">Carregando procedimentos…</p>
      ) : procedures.length === 0 ? (
        <p className="mt-4 text-sm text-lotus-600">Nenhum procedimento registrado.</p>
      ) : (
        <ul className="mt-4 space-y-3">
          {procedures.map((procedure) => {
            const payout = canViewPayout
              ? activePayout(payouts, procedure.id) ??
                payouts.find((item) => item.pregnancyProcedureId === procedure.id) ??
                null
              : null;
            const offerPayout =
              canManagePayout &&
              canOfferPayoutForProcedure(procedure) &&
              !activePayout(payouts, procedure.id);

            return (
              <li
                key={procedure.id}
                className="rounded-xl border border-lotus-100 px-3 py-3 text-sm sm:px-4"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="font-medium text-lotus-900">
                    {procedureLabel(procedure.procedureCode)}
                  </p>
                  <p className="text-lotus-600">{formatIsoDateBr(procedure.performedAt)}</p>
                </div>
                <p className="mt-1 text-lotus-700">
                  Realizado por{" "}
                  {procedure.performerName ??
                    nameByProfessionalId.get(procedure.performedByProfessionalId) ??
                    "profissional"}{" "}
                  ({procedure.performedAs === "principal" ? "principal" : "retaguarda"})
                </p>
                {procedure.notes ? (
                  <p className="mt-2 text-lotus-800">{procedure.notes}</p>
                ) : null}

                {canViewPayout ? (
                  <div className="mt-3 border-t border-lotus-50 pt-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-lotus-500">
                      Repasse à retaguarda
                    </p>
                    {payout ? (
                      <div className="mt-2 space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            className={`inline-flex rounded-lg border px-2 py-0.5 text-xs font-medium ${statusTone(payout.status)}`}
                          >
                            {PAYOUT_STATUS_LABEL[payout.status]}
                          </span>
                          <span className="font-medium text-lotus-900">
                            {formatCentsBRL(payout.amountCents)}
                          </span>
                          {payout.effectiveOn ? (
                            <span className="text-lotus-600">
                              Efetivo em {formatIsoDateBr(payout.effectiveOn)}
                            </span>
                          ) : null}
                        </div>
                        <button
                          type="button"
                          className={ghostButtonClass}
                          onClick={() =>
                            expandedPayoutId === payout.id
                              ? setExpandedPayoutId(null)
                              : void openPayoutDetail(payout)
                          }
                        >
                          {expandedPayoutId === payout.id ? "Ocultar detalhes" : "Ver detalhes"}
                        </button>
                        {expandedPayoutId === payout.id ? (
                          <PayoutDetail
                            payout={payout}
                            practiceId={practiceId}
                            events={events}
                            ledger={ledger}
                            editNotes={editNotes}
                            editAmount={editAmount}
                            settleDate={settleDate}
                            cancelReason={cancelReason}
                            busy={busy}
                            canManage={
                              authorization
                                ? canManageProcedurePayout(
                                    authorization,
                                    practiceId,
                                    primaryProfessionalId,
                                  )
                                : false
                            }
                            canEditNotes={
                              authorization
                                ? canEditProcedurePayoutNotes(
                                    authorization,
                                    practiceId,
                                    primaryProfessionalId,
                                    backupProfessionalId,
                                  )
                                : false
                            }
                            onNotesChange={setEditNotes}
                            onAmountChange={setEditAmount}
                            onSettleDateChange={setSettleDate}
                            onCancelReasonChange={setCancelReason}
                            onSaveNotes={() => void onSaveNotes(payout.id)}
                            onSaveAmount={() => void onSaveAmount(payout.id)}
                            onSettle={() => void onSettle(payout.id)}
                            onCancel={() => void onCancel(payout.id)}
                          />
                        ) : null}
                      </div>
                    ) : offerPayout ? (
                      payoutForProcedureId === procedure.id ? (
                        <form className="mt-2 space-y-2" onSubmit={onCreatePayout}>
                          <label className="block text-sm text-lotus-800">
                            Valor do repasse (R$)
                            <input
                              className={`${fieldClass} mt-1`}
                              value={payoutAmount}
                              onChange={(event) => setPayoutAmount(event.target.value)}
                              placeholder="2000,00"
                              required
                            />
                          </label>
                          <label className="block text-sm text-lotus-800">
                            Observações
                            <textarea
                              className={`${fieldClass} mt-1`}
                              rows={2}
                              value={payoutNotes}
                              onChange={(event) => setPayoutNotes(event.target.value)}
                            />
                          </label>
                          <div className="flex flex-wrap gap-2">
                            <button type="submit" className={buttonClass} disabled={busy}>
                              Criar repasse
                            </button>
                            <button
                              type="button"
                              className={ghostButtonClass}
                              onClick={() => setPayoutForProcedureId(null)}
                            >
                              Cancelar
                            </button>
                          </div>
                        </form>
                      ) : (
                        <button
                          type="button"
                          className={`${ghostButtonClass} mt-2`}
                          onClick={() => {
                            setPayoutForProcedureId(procedure.id);
                            setPayoutAmount("");
                            setPayoutNotes("");
                          }}
                        >
                          Registrar repasse
                        </button>
                      )
                    ) : procedure.performedAs === "principal" ? (
                      <p className="mt-2 text-lotus-600">
                        Sem repasse — procedimento da médica principal.
                      </p>
                    ) : (
                      <p className="mt-2 text-lotus-600">Nenhum repasse registrado.</p>
                    )}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}

      {canViewPayout && payouts.some((item) => item.status === "cancelled") ? (
        <div className="mt-4">
          <h3 className="text-sm font-semibold text-lotus-800">Repasses cancelados</h3>
          <ul className="mt-2 space-y-2">
            {payouts
              .filter((item) => item.status === "cancelled")
              .map((item) => (
                <li key={item.id} className="rounded-lg border border-stone-200 px-3 py-2 text-sm">
                  <span className="font-medium">{formatCentsBRL(item.amountCents)}</span>
                  <span className="text-lotus-600"> — cancelado</span>
                  {item.cancelReason ? (
                    <p className="mt-1 text-lotus-700">{item.cancelReason}</p>
                  ) : null}
                </li>
              ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}

function PayoutDetail({
  payout,
  practiceId: _practiceId,
  events,
  ledger,
  editNotes,
  editAmount,
  settleDate,
  cancelReason,
  busy,
  canManage,
  canEditNotes,
  onNotesChange,
  onAmountChange,
  onSettleDateChange,
  onCancelReasonChange,
  onSaveNotes,
  onSaveAmount,
  onSettle,
  onCancel,
}: {
  payout: PregnancyProcedurePayoutRow;
  practiceId: string;
  events: PayoutEventRow[];
  ledger: LedgerEntryRow[];
  editNotes: string;
  editAmount: string;
  settleDate: string;
  cancelReason: string;
  busy: boolean;
  canManage: boolean;
  canEditNotes: boolean;
  onNotesChange: (value: string) => void;
  onAmountChange: (value: string) => void;
  onSettleDateChange: (value: string) => void;
  onCancelReasonChange: (value: string) => void;
  onSaveNotes: () => void;
  onSaveAmount: () => void;
  onSettle: () => void;
  onCancel: () => void;
}) {
  void _practiceId;
  const amountLocked = payout.status !== "pending";

  return (
    <div className="space-y-4 rounded-lg bg-lotus-50/60 p-3">
      {canEditNotes && payout.status !== "cancelled" ? (
        <div>
          <label className="block text-sm text-lotus-800">
            Observação
            <textarea
              className={`${fieldClass} mt-1`}
              rows={2}
              value={editNotes}
              onChange={(event) => onNotesChange(event.target.value)}
            />
          </label>
          <button
            type="button"
            className={`${ghostButtonClass} mt-2`}
            disabled={busy}
            onClick={onSaveNotes}
          >
            Salvar observação
          </button>
        </div>
      ) : payout.notes ? (
        <p className="text-lotus-800">Observação: {payout.notes}</p>
      ) : null}

      {canManage && payout.status === "pending" ? (
        <div className="space-y-2">
          <label className="block text-sm text-lotus-800">
            Valor (R$)
            <input
              className={`${fieldClass} mt-1`}
              value={editAmount}
              onChange={(event) => onAmountChange(event.target.value)}
              disabled={amountLocked}
            />
          </label>
          <button
            type="button"
            className={ghostButtonClass}
            disabled={busy || amountLocked}
            onClick={onSaveAmount}
          >
            Atualizar valor
          </button>
          <label className="block text-sm text-lotus-800">
            Data efetiva
            <input
              type="date"
              className={`${fieldClass} mt-1`}
              value={settleDate}
              onChange={(event) => onSettleDateChange(event.target.value)}
            />
          </label>
          <button type="button" className={buttonClass} disabled={busy} onClick={onSettle}>
            Efetivar repasse
          </button>
        </div>
      ) : null}

      {canManage && (payout.status === "pending" || payout.status === "settled") ? (
        <div className="space-y-2 border-t border-lotus-100 pt-3">
          <label className="block text-sm text-lotus-800">
            Motivo do cancelamento
            <input
              className={`${fieldClass} mt-1`}
              value={cancelReason}
              onChange={(event) => onCancelReasonChange(event.target.value)}
            />
          </label>
          <button type="button" className={ghostButtonClass} disabled={busy} onClick={onCancel}>
            Cancelar repasse
          </button>
        </div>
      ) : null}

      {!canManage && canViewProcedurePayoutHint(payout) ? (
        <p className="text-xs text-lotus-600">Consulta — sem permissão de edição financeira.</p>
      ) : null}

      <div>
        <h4 className="text-xs font-semibold uppercase tracking-wide text-lotus-500">Histórico</h4>
        {events.length === 0 ? (
          <p className="mt-1 text-lotus-600">Sem eventos.</p>
        ) : (
          <ol className="mt-2 space-y-2">
            {events.map((item) => (
              <li key={item.id} className="text-lotus-700">
                <span className="font-medium">{eventLabel(item.kind)}</span>
                {" · "}
                {formatDateTime(item.occurredAt)}
                {item.beforeAmountCents != null &&
                item.afterAmountCents != null &&
                item.beforeAmountCents !== item.afterAmountCents ? (
                  <span>
                    {" "}
                    ({formatCentsBRL(item.beforeAmountCents)} →{" "}
                    {formatCentsBRL(item.afterAmountCents)})
                  </span>
                ) : null}
              </li>
            ))}
          </ol>
        )}
      </div>

      <div>
        <h4 className="text-xs font-semibold uppercase tracking-wide text-lotus-500">Ledger</h4>
        {ledger.length === 0 ? (
          <p className="mt-1 text-lotus-600">
            Sem lançamento (pendente não contabiliza; cancelado antes da efetivação também não).
          </p>
        ) : (
          <ul className="mt-2 space-y-1">
            {ledger.map((item) => (
              <li key={item.id} className="text-lotus-700">
                {item.effect === "reverse" ? "Estorno · " : ""}
                {item.direction === "outflow" ? "Saída" : "Entrada"} ·{" "}
                {formatCentsBRL(item.amountCents)} · {formatDateTime(item.entryAt)}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function canViewProcedurePayoutHint(payout: PregnancyProcedurePayoutRow): boolean {
  return payout.status === "settled" || payout.status === "pending" || payout.status === "cancelled";
}
