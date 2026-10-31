"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import type { Patient360Snapshot } from "@/lib/patients/patient-360";
import { buttonVariantClass } from "@/components/ui/buttonStyles";
import { EmptyState } from "@/components/ui/EmptyState";

function Card({
  title,
  children,
  action,
}: {
  title: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <section className="min-w-0 rounded-2xl border border-lotus-100 bg-white px-4 py-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-lotus-500">{title}</h3>
        {action}
      </div>
      <div className="mt-2 text-sm text-lotus-900">{children}</div>
    </section>
  );
}

/**
 * C070-C4.4 — cartões de contexto do Patient 360 (sem dashboard excessivo).
 */
export function Patient360Overview({
  snapshot,
  loading,
}: {
  snapshot: Patient360Snapshot | null;
  loading?: boolean;
}) {
  if (loading) {
    return <p className="mt-4 text-sm text-lotus-600">Carregando visão da paciente…</p>;
  }
  if (!snapshot) {
    return (
      <div className="mt-4">
        <EmptyState
          title="Resumo indisponível"
          description="Não foi possível montar a visão da paciente neste momento."
        />
      </div>
    );
  }

  return (
    <div className="mt-4 space-y-4" data-patient-360-overview="true">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {snapshot.includeClinical ? (
          <Card
            title="Último atendimento"
            action={
              snapshot.lastEncounter ? (
                <Link
                  href={`/app/records/${snapshot.lastEncounter.id}?from=patient&patientId=${snapshot.patientId}`}
                  className="text-xs font-medium text-lotus-800 underline-offset-2 hover:underline"
                >
                  Abrir
                </Link>
              ) : null
            }
          >
            {snapshot.lastEncounter ? (
              <>
                <p className="font-medium">
                  {snapshot.lastEncounter.isReturn ? "Retorno" : "Atendimento"}
                </p>
                <p className="mt-1 text-lotus-700">
                  {snapshot.lastEncounter.whenLabel} · {snapshot.lastEncounter.statusLabel}
                </p>
              </>
            ) : (
              <p className="text-lotus-600">Ainda não há atendimentos registrados.</p>
            )}
          </Card>
        ) : null}

        <Card
          title="Próxima consulta"
          action={
            <Link
              href={snapshot.links.agenda}
              className="text-xs font-medium text-lotus-800 underline-offset-2 hover:underline"
            >
              Agenda
            </Link>
          }
        >
          {snapshot.nextAppointment ? (
            <>
              <p className="font-medium">{snapshot.nextAppointment.whenLabel}</p>
              <p className="mt-1 text-lotus-700">
                {[
                  snapshot.nextAppointment.kindLabel,
                  snapshot.nextAppointment.professionalName,
                  snapshot.nextAppointment.statusLabel,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            </>
          ) : (
            <p className="text-lotus-600">Nenhuma consulta futura nos próximos 60 dias.</p>
          )}
        </Card>

        {snapshot.includeClinical ? (
          <Card
            title="Obstetrícia"
            action={
              snapshot.pregnancy ? (
                <Link
                  href={snapshot.pregnancy.href}
                  className="text-xs font-medium text-lotus-800 underline-offset-2 hover:underline"
                >
                  Abrir
                </Link>
              ) : snapshot.links.obstetrics ? (
                <Link
                  href={snapshot.links.obstetrics}
                  className="text-xs font-medium text-lotus-800 underline-offset-2 hover:underline"
                >
                  Registrar
                </Link>
              ) : null
            }
          >
            {snapshot.pregnancy ? (
              <>
                <p className="font-medium">Gestação ativa · {snapshot.pregnancy.statusLabel}</p>
                <p className="mt-1 text-lotus-700">
                  {[
                    snapshot.pregnancy.lmpLabel ? `DUM ${snapshot.pregnancy.lmpLabel}` : null,
                    snapshot.pregnancy.eddLabel ? `DPP ${snapshot.pregnancy.eddLabel}` : null,
                  ]
                    .filter(Boolean)
                    .join(" · ") || "Datas não informadas"}
                </p>
              </>
            ) : (
              <p className="text-lotus-600">Nenhuma gestação ativa cadastrada.</p>
            )}
          </Card>
        ) : null}
      </div>

      {snapshot.includeClinical ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <Card
            title="Exames"
            action={
              <Link
                href={snapshot.links.exams}
                className={`${buttonVariantClass.ghost} min-h-8 px-2 py-1 text-xs`}
              >
                Ver exames
              </Link>
            }
          >
            <p>
              {snapshot.examsCount === 0
                ? "Nenhum exame registrado."
                : `${snapshot.examsCount} registro(s) recentes.`}
            </p>
          </Card>
          <Card
            title="Receitas"
            action={
              <Link
                href={snapshot.links.prescriptions}
                className={`${buttonVariantClass.ghost} min-h-8 px-2 py-1 text-xs`}
              >
                Ver receitas
              </Link>
            }
          >
            <p>
              {snapshot.prescriptionsCount === 0
                ? "Nenhuma receita registrada."
                : `${snapshot.prescriptionsCount} registro(s) recentes.`}
            </p>
          </Card>
        </div>
      ) : null}
    </div>
  );
}
