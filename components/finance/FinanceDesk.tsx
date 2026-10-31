"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { isCasaBrowserAuth } from "@/lib/auth/casa-mode";
import {
  createExpenseCasa,
  createInvoiceCasa,
  createPaymentCasa,
  loadFinanceCasa,
  type FinanceSnapshot,
} from "@/lib/casa/writes";
import { StatusMessage, fieldClass, ghostButtonClass } from "@/components/platform/Ui";

const empty: FinanceSnapshot = {
  invoices: [],
  payments: [],
  splits: [],
  expenses: [],
  centers: [],
};

export function FinanceDesk() {
  const { authorization } = useAuth();
  const casa = isCasaBrowserAuth();
  const [data, setData] = useState<FinanceSnapshot>(empty);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [practiceId, setPracticeId] = useState("");
  const [patientId, setPatientId] = useState("");
  const [totalCents, setTotalCents] = useState("");
  const [invoiceId, setInvoiceId] = useState("");
  const [paymentCents, setPaymentCents] = useState("");
  const [centerId, setCenterId] = useState("");
  const [shared, setShared] = useState(false);
  const [description, setDescription] = useState("");
  const [expenseCents, setExpenseCents] = useState("");
  const [competence, setCompetence] = useState("");

  const canWriteInvoice = Boolean(
    authorization?.memberships.some((item) => item.canCashier || item.role === "admin"),
  );
  const canWriteExpense = Boolean(authorization?.memberships.some((item) => item.role === "admin"));

  async function reload() {
    const next = await loadFinanceCasa();
    setData(next);
  }

  useEffect(() => {
    if (!casa) return;
    void reload().catch((err: unknown) => {
      setError(err instanceof Error ? err.message : "Não foi possível carregar o financeiro.");
    });
  }, [casa]);

  if (!casa) {
    return (
      <p className="text-sm text-lotus-700">
        O financeiro da casa aparece quando o modo da casa está ligado. Nesta publicação, a tela antiga continua no cliente atual.
      </p>
    );
  }

  const organizationId = authorization?.profile?.organizationId ?? "";

  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-lotus-500">Gestão</p>
      <h1 className="page-title mt-1">Financeiro</h1>
      <p className="page-sub mt-2">
        Fatura e pagamento da própria prática. A administradora vê as duas. O rateio só é lido, no valor já gravado. Despesa compartilhada não tem prática. Despesa particular fica na prática.
      </p>
      <StatusMessage error={error} notice={notice} />
      <section className="mt-6">
        <h2 className="text-sm font-semibold text-lotus-900">Faturas</h2>
        <ul className="mt-2 space-y-1 text-sm">
          {data.invoices.map((row) => (
            <li key={String(row.id)}>
              {String(row.practice_id)} · {String(row.total_cents)} centavos
            </li>
          ))}
        </ul>
        {canWriteInvoice ? (
          <form
            className="mt-3 flex flex-wrap gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              void createInvoiceCasa({
                organizationId,
                practiceId,
                patientId,
                payerKind: "private",
                totalCents: Number(totalCents),
              })
                .then(async () => {
                  setNotice("Fatura registrada.");
                  setError(null);
                  await reload();
                })
                .catch((err: unknown) => {
                  setError(err instanceof Error ? err.message : "A política de acesso recusou a fatura.");
                });
            }}
          >
            <input className={fieldClass} placeholder="Prática" value={practiceId} onChange={(event) => setPracticeId(event.target.value)} required />
            <input className={fieldClass} placeholder="Paciente" value={patientId} onChange={(event) => setPatientId(event.target.value)} required />
            <input className={fieldClass} placeholder="Centavos" value={totalCents} onChange={(event) => setTotalCents(event.target.value)} required />
            <button className={ghostButtonClass} type="submit">Registrar fatura</button>
          </form>
        ) : null}
      </section>
      <section className="mt-6">
        <h2 className="text-sm font-semibold text-lotus-900">Pagamentos</h2>
        <ul className="mt-2 space-y-1 text-sm">
          {data.payments.map((row) => (
            <li key={String(row.id)}>
              {String(row.invoice_id)} · {String(row.amount_cents)} centavos
            </li>
          ))}
        </ul>
        {canWriteInvoice ? (
          <form
            className="mt-3 flex flex-wrap gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              void createPaymentCasa({
                invoiceId,
                method: "cash",
                amountCents: Number(paymentCents),
              })
                .then(async () => {
                  setNotice("Pagamento registrado.");
                  setError(null);
                  await reload();
                })
                .catch((err: unknown) => {
                  setError(err instanceof Error ? err.message : "A política de acesso recusou o pagamento.");
                });
            }}
          >
            <input className={fieldClass} placeholder="Fatura" value={invoiceId} onChange={(event) => setInvoiceId(event.target.value)} required />
            <input className={fieldClass} placeholder="Centavos" value={paymentCents} onChange={(event) => setPaymentCents(event.target.value)} required />
            <button className={ghostButtonClass} type="submit">Registrar pagamento</button>
          </form>
        ) : null}
      </section>
      <section className="mt-6">
        <h2 className="text-sm font-semibold text-lotus-900">Rateios</h2>
        <ul className="mt-2 space-y-1 text-sm">
          {data.splits.map((row) => (
            <li key={String(row.id)}>
              {String(row.payment_id)} · {String(row.amount_cents)} centavos
            </li>
          ))}
        </ul>
      </section>
      <section className="mt-6">
        <h2 className="text-sm font-semibold text-lotus-900">Despesas</h2>
        <ul className="mt-2 space-y-1 text-sm">
          {data.expenses.map((row) => (
            <li key={String(row.id)}>
              {row.practice_id ? "Particular" : "Compartilhada"} · {String(row.description)} · {String(row.amount_cents)} centavos
            </li>
          ))}
        </ul>
        {canWriteExpense ? (
          <form
            className="mt-3 space-y-2"
            onSubmit={(event) => {
              event.preventDefault();
              void createExpenseCasa({
                organizationId,
                costCenterId: centerId,
                practiceId,
                competence,
                description,
                amountCents: Number(expenseCents),
                shared,
              })
                .then(async () => {
                  setNotice("Despesa registrada.");
                  setError(null);
                  await reload();
                })
                .catch((err: unknown) => {
                  setError(err instanceof Error ? err.message : "A política de acesso recusou a despesa.");
                });
            }}
          >
            <select className={fieldClass} value={centerId} onChange={(event) => setCenterId(event.target.value)} required>
              <option value="">Centro</option>
              {data.centers.map((row) => (
                <option key={String(row.id)} value={String(row.id)}>
                  {String(row.name)} {row.is_shared ? "(compartilhado)" : "(particular)"}
                </option>
              ))}
            </select>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={shared} onChange={(event) => setShared(event.target.checked)} />
              Despesa compartilhada da casa
            </label>
            <input className={fieldClass} type="date" value={competence} onChange={(event) => setCompetence(event.target.value)} required />
            <input className={fieldClass} placeholder="Descrição" value={description} onChange={(event) => setDescription(event.target.value)} required />
            <input className={fieldClass} placeholder="Centavos" value={expenseCents} onChange={(event) => setExpenseCents(event.target.value)} required />
            <button className={ghostButtonClass} type="submit">Registrar despesa</button>
          </form>
        ) : null}
      </section>
    </div>
  );
}
