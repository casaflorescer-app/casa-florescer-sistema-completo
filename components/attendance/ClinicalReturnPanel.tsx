"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  encounterOpenReturn,
  listReturnsOfEncounter,
  type EncounterRow,
} from "@/lib/attendance/directory";
import {
  loadPriorEncounterContext,
  type PriorEncounterContext,
} from "@/lib/attendance/return-context";
import {
  agendaReturnHref,
  encounterWorkspaceHref,
} from "@/lib/attendance/return-link";
import { formatDateTime } from "@/lib/platform/format";
import { buttonClass, ghostButtonClass, StatusMessage } from "@/components/platform/Ui";
import { ENCOUNTER_STATUS_LABEL } from "@/lib/attendance/directory";

function snippet(text: string | null | undefined, max = 220) {
  const clean = (text ?? "").replace(/\s+/g, " ").trim();
  if (!clean) return null;
  return clean.length > max ? `${clean.slice(0, max)}…` : clean;
}

export function ClinicalReturnPanel({
  supabase,
  encounter,
  canManage,
  locked,
}: {
  supabase: SupabaseClient;
  encounter: EncounterRow;
  canManage: boolean;
  locked: boolean;
}) {
  const router = useRouter();
  const [prior, setPrior] = useState<PriorEncounterContext | null>(null);
  const [childReturns, setChildReturns] = useState<EncounterRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [showPriorDetail, setShowPriorDetail] = useState(false);
  const openRequestRef = useRef(false);

  const isReturn = Boolean(encounter.returnOfEncounterId);
  const sourceId = encounter.returnOfEncounterId;

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (sourceId) {
        const ctx = await loadPriorEncounterContext(supabase, sourceId);
        setPrior(ctx);
      } else {
        setPrior(null);
      }
      const children = await listReturnsOfEncounter(supabase, encounter.id);
      setChildReturns(children);
    } catch {
      setError("Não foi possível carregar o contexto de retorno.");
    } finally {
      setLoading(false);
    }
  }, [encounter.id, sourceId, supabase]);

  useEffect(() => {
    void reload();
  }, [reload]);

  async function startReturnNow() {
    if (!canManage || busy || openRequestRef.current) return;
    openRequestRef.current = true;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const result = await encounterOpenReturn(supabase, {
        sourceEncounterId: encounter.id,
      });
      if (result.error || !result.encounterId) {
        setError(result.error ?? "Não foi possível iniciar o retorno.");
        return;
      }
      if (result.encounterId === encounter.id) {
        setNotice("Este atendimento já é o retorno em andamento.");
        return;
      }
      setNotice("Retorno aberto. Redirecionando…");
      router.push(encounterWorkspaceHref(result.encounterId));
    } finally {
      setBusy(false);
      openRequestRef.current = false;
    }
  }

  return (
    <section id="retorno" className="card mt-4 scroll-mt-16 overflow-x-hidden">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-lotus-900">Retorno</h2>
          <p className="mt-1 text-sm text-lotus-600">
            Continuidade clínica no mesmo prontuário. O atendimento anterior permanece íntegro;
            o retorno é um novo encounter.
          </p>
        </div>
        {isReturn ? (
          <span className="inline-flex rounded-full border border-lotus-300 bg-lotus-50 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-lotus-800">
            Retorno
          </span>
        ) : null}
      </div>

      {loading ? <p className="mt-3 text-sm text-lotus-600">Carregando retorno…</p> : null}
      <div className="mt-3">
        <StatusMessage error={error} notice={notice} />
      </div>

      {isReturn && prior ? (
        <div className="mt-4 rounded-xl border border-lotus-100 bg-lotus-50/60 px-3 py-3">
          <p className="text-sm font-semibold text-lotus-900">
            Retorno de atendimento de{" "}
            {formatDateTime(prior.encounter.signedAt ?? prior.encounter.createdAt)}
          </p>
          <p className="mt-1 text-xs text-lotus-600">
            Origem · {ENCOUNTER_STATUS_LABEL[prior.encounter.status]} · somente leitura
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Link
              href={encounterWorkspaceHref(prior.encounter.id, { fromReturn: encounter.id })}
              className={ghostButtonClass}
            >
              Ver atendimento anterior
            </Link>
            <button
              type="button"
              className={ghostButtonClass}
              onClick={() => setShowPriorDetail((v) => !v)}
            >
              {showPriorDetail ? "Ocultar resumo" : "Resumo do anterior"}
            </button>
          </div>
          {showPriorDetail ? <PriorSummary prior={prior} /> : null}
        </div>
      ) : null}

      {isReturn && !prior && !loading ? (
        <p className="mt-3 text-sm text-lotus-600">
          Este atendimento está marcado como retorno, mas o atendimento de origem não pôde ser
          carregado.
        </p>
      ) : null}

      {!isReturn ? (
        <div className="mt-4 space-y-3">
          <p className="text-sm text-lotus-700">
            {locked
              ? "Atendimento finalizado. Você pode iniciar um retorno agora ou agendar na agenda."
              : "Enquanto o atendimento estiver em andamento, o retorno costuma ser indicado após a assinatura. Ainda assim, é possível agendar um retorno futuro."}
          </p>
          <div className="flex flex-wrap gap-2">
            {canManage && locked ? (
              <button
                type="button"
                className={buttonClass}
                disabled={busy}
                onClick={() => void startReturnNow()}
              >
                {busy ? "Abrindo retorno…" : "Iniciar retorno agora"}
              </button>
            ) : null}
            {canManage ? (
              <Link
                href={agendaReturnHref({
                  patientId: encounter.patientId,
                  sourceEncounterId: encounter.id,
                })}
                className={ghostButtonClass}
              >
                Agendar retorno
              </Link>
            ) : null}
          </div>
        </div>
      ) : null}

      {childReturns.length > 0 ? (
        <div className="mt-4 border-t border-lotus-100 pt-3">
          <p className="text-sm font-semibold text-lotus-900">Retornos deste atendimento</p>
          <ul className="mt-2 space-y-2">
            {childReturns.map((row) => (
              <li
                key={row.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-lotus-100 bg-white px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="text-sm text-lotus-900">
                    {formatDateTime(row.signedAt ?? row.createdAt)}
                  </p>
                  <p className="text-xs text-lotus-600">{ENCOUNTER_STATUS_LABEL[row.status]}</p>
                </div>
                <Link href={encounterWorkspaceHref(row.id)} className={ghostButtonClass}>
                  {row.status === "open" ? "Continuar retorno" : "Abrir retorno"}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}

function PriorSummary({ prior }: { prior: PriorEncounterContext }) {
  const complaint = snippet(prior.chiefComplaint?.chiefComplaint);
  const soapBits = [
    prior.soap?.subjective ? `S: ${snippet(prior.soap.subjective, 120)}` : null,
    prior.soap?.objective ? `O: ${snippet(prior.soap.objective, 120)}` : null,
    prior.soap?.assessment ? `A: ${snippet(prior.soap.assessment, 120)}` : null,
    prior.soap?.plan ? `P: ${snippet(prior.soap.plan, 120)}` : null,
  ].filter(Boolean);

  return (
    <div className="mt-3 space-y-2 text-sm text-lotus-800">
      {complaint ? (
        <p>
          <span className="font-medium">Queixa:</span> {complaint}
        </p>
      ) : null}
      {prior.anamnesis?.changesSinceLastVisit || prior.anamnesis?.personalHistoryNotes ? (
        <p>
          <span className="font-medium">Anamnese:</span>{" "}
          {snippet(
            prior.anamnesis.changesSinceLastVisit || prior.anamnesis.personalHistoryNotes,
          )}
        </p>
      ) : null}
      {soapBits.length ? (
        <p>
          <span className="font-medium">SOAP:</span> {soapBits.join(" · ")}
        </p>
      ) : (
        <p className="text-lotus-600">Sem SOAP registrado no atendimento anterior.</p>
      )}
      <p className="text-xs text-lotus-600">
        Receitas neste encounter: {prior.prescriptionsCount} · Pedidos de exame:{" "}
        {prior.examRequestsCount} · Orientações: {prior.orientationsCount}
      </p>
      <p className="text-xs text-lotus-500">
        Conteúdo anterior somente leitura. Novos registros ficam neste retorno.
      </p>
    </div>
  );
}
