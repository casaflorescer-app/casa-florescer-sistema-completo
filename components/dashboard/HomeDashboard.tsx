"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { CalendarDays, Heart, Plus, Users, Wallet } from "lucide-react";
import type { AuthorizationContext } from "@/lib/auth/authorization";
import { hasStaffRole, isClinicStaff } from "@/lib/auth/access";
import { loadHomeCasa, type HomeSnapshot } from "@/lib/casa/reads";
import { PatientPhotoThumb } from "@/components/patients/PatientPhotoThumb";

const CLOCK = new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });
const MONEY = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

const KIND_LABEL = { consultation: "Consulta", procedure: "Procedimento" } as const;

function firstName(fullName: string) {
  const clean = fullName.includes("@") ? fullName.split("@")[0] ?? fullName : fullName;
  return clean.trim().split(/\s+/)[0] || "bem-vinda";
}

function money(cents: number) {
  return MONEY.format(cents / 100);
}

export function HomeDashboard({ auth }: { auth: AuthorizationContext }) {
  const fullName = auth.profile?.fullName || auth.user.email || "";
  const physician = hasStaffRole(auth, "physician");
  const professional =
    auth.memberships.find((item) => item.role === "physician" && item.professional?.id)?.professional ??
    null;
  const missingProfessional = physician && !professional;
  const practiceIds = [...new Set(auth.memberships.map((item) => item.practiceId))];
  const includeFinance =
    hasStaffRole(auth, "owner") ||
    hasStaffRole(auth, "admin") ||
    auth.memberships.some((item) => item.canCashier);
  const scope = professional ? "professional" : missingProfessional ? "none" : isClinicStaff(auth) ? "practice" : "none";

  const [snapshot, setSnapshot] = useState<HomeSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void loadHomeCasa({
      professionalId: professional?.id ?? null,
      practiceIds,
      includeFinance,
      appointmentScope: scope,
    })
      .then((data) => {
        if (!cancelled) setSnapshot(data);
      })
      .catch(() => {
        if (!cancelled) setError("Não foi possível carregar o painel.");
      });
    return () => {
      cancelled = true;
    };
  }, [professional?.id, includeFinance, scope, practiceIds.join("|")]);

  return (
    <div className="-m-3 min-h-[calc(100dvh-4rem)] space-y-3 bg-[radial-gradient(ellipse_at_top,_#e7b7d4_0%,_#ad79ab_38%,_#602747_100%)] p-3 lg:-m-3.5 lg:p-3.5">
      <section className="relative overflow-hidden rounded-2xl bg-[radial-gradient(circle_at_58%_42%,_#f3c3df_0%,_#ce619f_38%,_#602747_100%)] px-4 py-4 text-white shadow-sm lg:min-h-[300px] lg:px-5">
        <HeroGlow />
        <div className="relative z-10 grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(180px,0.9fr)_338px] lg:items-center">
          <div className="max-w-md">
            <p className="text-sm text-white/85">Bem-vinda à</p>
            <h1 className="mt-1 text-[2rem] font-semibold leading-none tracking-tight sm:text-[2.6rem]">
              Casa Florescer
            </h1>
            <p className="mt-3 max-w-xs text-sm leading-6 text-white/90">
              Cuidado integral à saúde da mulher, em todas as fases da sua vida.
            </p>
            <p className="mt-2 text-xs text-white/75">Olá, {firstName(fullName)}</p>
            {isClinicStaff(auth) ? (
              <Link
                href="/app/agenda"
                className="mt-4 inline-flex min-h-10 items-center gap-2 rounded-xl bg-casa-rose px-4 text-sm font-semibold text-white shadow-sm hover:bg-white hover:text-casa-plum"
              >
                <Plus className="h-4 w-4" aria-hidden />
                Novo atendimento
              </Link>
            ) : null}
          </div>
          <img
            src="/brand/gestante.webp"
            alt=""
            width={864}
            height={1152}
            className="pointer-events-none mx-auto h-64 w-auto max-w-full object-contain [mask-image:radial-gradient(ellipse_at_center,black_58%,transparent_78%)] lg:h-[280px]"
            aria-hidden
          />
          <div className="grid gap-2.5">
            <Metric icon={<CalendarDays className="h-4 w-4" aria-hidden />} label="Consultas hoje" value={snapshot ? snapshot.todayCount ?? "—" : null} />
            <Metric icon={<Users className="h-4 w-4" aria-hidden />} label="Pacientes" value={snapshot?.patients ?? null} />
            <Metric icon={<Heart className="h-4 w-4" aria-hidden />} label="Gestações em acompanhamento" value={snapshot?.pregnanciesInCare ?? null} />
            {includeFinance ? (
              <Metric icon={<Wallet className="h-4 w-4" aria-hidden />} label="Recebido no mês" value={snapshot ? money(snapshot.financeCents ?? 0) : null} />
            ) : null}
          </div>
        </div>
      </section>

      {missingProfessional ? (
        <p className="rounded-2xl border border-casa-rose/40 bg-white px-4 py-3 text-sm text-casa-ink" role="status">
          Seu perfil profissional ainda não está configurado. Peça à administração da clínica para vincular você como profissional nesta unidade.
        </p>
      ) : null}
      {error ? (
        <p className="rounded-2xl bg-white px-4 py-3 text-sm text-rose-800" role="alert">
          {error}
        </p>
      ) : null}

      <section className="grid gap-3 lg:grid-cols-[41fr_29fr_30fr]">
        <article className="rounded-2xl bg-casa-mist p-4 shadow-[0_8px_24px_rgb(96_39_71_/_0.06)]">
          <h2 className="text-base font-semibold text-casa-ink">Próximos atendimentos</h2>
          {snapshot && snapshot.upcoming.length > 0 ? (
            <ul className="mt-4 space-y-3">
              {snapshot.upcoming.map((item) => (
                <li key={item.id} className="flex items-center justify-between gap-3 text-sm">
                  <span>
                    <span className="block font-medium text-casa-ink">{item.patientName}</span>
                    <span className="text-casa-ink/60">{KIND_LABEL[item.kind]}</span>
                  </span>
                  <span className="shrink-0 text-casa-plum">{CLOCK.format(new Date(item.startsAt))}</span>
                </li>
              ))}
            </ul>
          ) : (
            <Empty>Nenhum horário à frente.</Empty>
          )}
        </article>
        <article className="rounded-2xl bg-casa-mist p-4 shadow-[0_8px_24px_rgb(96_39_71_/_0.06)]">
          <h2 className="text-base font-semibold text-casa-ink">Pacientes recentes</h2>
          {snapshot && snapshot.recent.length > 0 ? (
            <ul className="mt-4 space-y-3">
              {snapshot.recent.map((item) => (
                <li key={item.id} className="flex items-center gap-3 text-sm">
                  <PatientPhotoThumb photoPath={item.photoPath} patientName={item.fullName} />
                  <Link href={`/app/patients/${item.id}`} className="font-medium text-casa-ink hover:underline">
                    {item.fullName}
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <Empty>Nenhuma paciente recente neste recorte.</Empty>
          )}
        </article>
        <article className="rounded-2xl bg-casa-mist p-4 shadow-[0_8px_24px_rgb(96_39_71_/_0.06)]">
          <h2 className="text-base font-semibold text-casa-ink">Pendências</h2>
          {snapshot && snapshot.pending.length > 0 ? (
            <ul className="mt-4 space-y-3 text-sm">
              {snapshot.pending.map((item) => (
                <li key={item.id} className="text-casa-ink">
                  Atendimento aberto · {item.patientName}
                </li>
              ))}
            </ul>
          ) : (
            <Empty>Nenhuma pendência aberta.</Empty>
          )}
        </article>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Summary label="Consultas hoje" value={snapshot ? snapshot.todayCount ?? "—" : null} />
        <Summary label="Pacientes" value={snapshot?.patients ?? null} />
        <Summary label="Gestações em acompanhamento" value={snapshot?.pregnanciesInCare ?? null} />
        {includeFinance ? <Summary label="Recebido no mês" value={snapshot ? money(snapshot.financeCents ?? 0) : null} /> : null}
      </section>
    </div>
  );
}

function Metric({ icon, label, value }: { icon: ReactNode; label: string; value: number | string | null }) {
  return (
    <article className="flex min-h-[68px] items-center gap-3 rounded-2xl bg-casa-mist px-4 py-2.5 shadow-[0_8px_24px_rgb(96_39_71_/_0.08)]">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white text-casa-plum">{icon}</span>
      <span className="min-w-0">
        <span className="block truncate text-xs text-casa-ink/70">{label}</span>
        <span className="block text-xl font-semibold tracking-tight text-casa-ink">{value === null ? "…" : value}</span>
      </span>
    </article>
  );
}

function Summary({ label, value }: { label: string; value: number | string | null }) {
  return (
    <article className="rounded-2xl bg-casa-mist px-4 py-3 shadow-[0_8px_24px_rgb(96_39_71_/_0.06)]">
      <h2 className="text-xs text-casa-ink/70">{label}</h2>
      <p className="mt-1 text-lg font-semibold text-casa-ink">{value === null ? "…" : value}</p>
    </article>
  );
}

function HeroGlow() {
  return (
    <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 1000 360" preserveAspectRatio="xMidYMid slice" aria-hidden>
      <circle cx="560" cy="180" r="120" fill="none" stroke="white" strokeOpacity="0.28" />
      <circle cx="560" cy="180" r="168" fill="none" stroke="white" strokeOpacity="0.16" />
      <path d="M0 300C180 250 280 340 460 290C640 240 760 320 1000 260" fill="none" stroke="white" strokeOpacity="0.2" strokeWidth="8" />
    </svg>
  );
}

function Empty({ children }: { children: string }) {
  return <p className="mt-6 text-sm text-casa-ink/60">{children}</p>;
}
