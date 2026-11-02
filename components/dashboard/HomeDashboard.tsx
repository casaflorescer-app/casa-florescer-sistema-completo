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

  const metrics = [
    { icon: <CalendarDays className="h-5 w-5" aria-hidden />, label: "Consultas hoje", value: snapshot ? snapshot.todayCount ?? "—" : null },
    { icon: <Users className="h-5 w-5" aria-hidden />, label: "Pacientes", value: snapshot?.patients ?? null },
    { icon: <Heart className="h-5 w-5" aria-hidden />, label: "Gestações em acompanhamento", value: snapshot?.pregnanciesInCare ?? null },
    ...(includeFinance
      ? [{ icon: <Wallet className="h-5 w-5" aria-hidden />, label: "Recebido no mês", value: snapshot ? money(snapshot.financeCents ?? 0) : null }]
      : []),
  ];

  return (
    <div className="space-y-4">
      <section className="relative">
        <HeroGlow />
        <div className="relative z-10 grid items-start gap-4 lg:grid-cols-[minmax(220px,1fr)_minmax(220px,280px)_300px]">
          <div className="max-w-sm pt-2 text-white">
            <div className="flex items-start gap-3">
              <TitleLotus />
              <div>
                <p className="text-sm leading-5 text-white/85">Bem-vinda à</p>
                <h1 className="mt-1 text-[2rem] font-semibold leading-none tracking-tight sm:text-[2.6rem]">Casa Florescer</h1>
              </div>
            </div>
            <p className="mt-4 max-w-[16rem] text-sm leading-6 text-white/90">
              Cuidado integral à saúde da mulher, em todas as fases da sua vida.
            </p>
            <p className="mt-2 text-xs text-white/75">Olá, {firstName(fullName)}</p>
            {isClinicStaff(auth) ? (
              <Link
                href="/app/agenda"
                className="mt-5 inline-flex min-h-10 items-center gap-2 rounded-xl bg-casa-rose px-4 text-sm font-semibold text-white shadow-sm hover:bg-white hover:text-casa-plum"
              >
                <Plus className="h-4 w-4" aria-hidden />
                Novo atendimento
              </Link>
            ) : null}
          </div>
          <div className="relative mx-auto h-80 w-full max-w-[260px] lg:h-[390px] lg:max-w-[280px]">
            <GestanteFigure />
          </div>
          <div className="grid content-start gap-2.5">
            {metrics.map((item) => (
              <Metric key={item.label} icon={item.icon} label={item.label} value={item.value} />
            ))}
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

      <section className="grid gap-3 lg:grid-cols-5">
        <article className="rounded-2xl bg-[#fcf7fa] p-4 shadow-[0_8px_24px_rgb(96_39_71_/_0.06)] lg:col-span-3">
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
        <article className="rounded-2xl bg-[#fcf7fa] p-4 shadow-[0_8px_24px_rgb(96_39_71_/_0.06)] lg:col-span-2">
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
        <article className="rounded-2xl bg-[#fcf7fa] p-4 shadow-[0_8px_24px_rgb(96_39_71_/_0.06)] lg:col-span-5">
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

      <section className="flex flex-col overflow-hidden rounded-2xl bg-[#fcf7fa] shadow-[0_8px_24px_rgb(96_39_71_/_0.06)] sm:flex-row">
        {metrics.map((item) => (
          <Summary key={item.label} label={item.label} value={item.value} />
        ))}
      </section>
    </div>
  );
}

function Metric({ icon, label, value }: { icon: ReactNode; label: string; value: number | string | null }) {
  return (
    <article className="flex min-h-[74px] items-center gap-3 rounded-2xl bg-[#fcf7fa] px-4 py-3 shadow-[0_10px_24px_rgb(96_39_71_/_0.08)]">
      <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#f3d0e2] text-casa-plum">{icon}</span>
      <span className="min-w-0">
        <span className="block text-xs leading-4 text-casa-ink/70">{label}</span>
        <span className="block text-2xl font-semibold leading-tight tracking-tight text-casa-ink">{value === null ? "…" : value}</span>
      </span>
    </article>
  );
}

function Summary({ label, value }: { label: string; value: number | string | null }) {
  return (
    <div className="min-w-0 flex-1 border-casa-rose/15 px-4 py-3 sm:border-l sm:first:border-l-0">
      <h2 className="text-xs text-casa-ink/70">{label}</h2>
      <p className="mt-1 text-xl font-semibold text-casa-ink">{value === null ? "…" : value}</p>
    </div>
  );
}

function TitleLotus() {
  return (
    <svg viewBox="0 0 72 72" className="mt-1 h-14 w-14 shrink-0 text-[#f6c6de]" aria-hidden>
      <g fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round">
        <path d="M36 8c2 10 6 16 6 24s-6 14-6 26c0-12-6-18-6-26s4-14 6-24Z" />
        <path d="M36 22c8-2 16 2 20 10 2 6-2 12-8 14-6-6-10-14-12-24Z" />
        <path d="M36 22c-8-2-16 2-20 10-2 6 2 12 8 14 6-6 10-14 12-24Z" />
        <path d="M30 42c-8 2-14 8-12 16 6 2 12-2 16-8" />
        <path d="M42 42c8 2 14 8 12 16-6 2-12-2-16-8" />
      </g>
    </svg>
  );
}

function GestanteFigure() {
  return (
    <>
      <svg className="pointer-events-none absolute -inset-8 h-[calc(100%+4rem)] w-[calc(100%+4rem)]" viewBox="0 0 340 470" aria-hidden>
        <circle cx="170" cy="210" r="128" fill="none" stroke="white" strokeWidth="1.15" strokeOpacity="0.45" />
        <circle cx="170" cy="210" r="164" fill="none" stroke="white" strokeWidth="1" strokeOpacity="0.24" />
        <path d="M78 168c10-10 10-18 0-26-8 10-8 18 0 26Z" fill="none" stroke="white" strokeWidth="1.2" strokeOpacity="0.8" />
      </svg>
      <img
        src="/brand/gestante.webp"
        alt=""
        width={864}
        height={1152}
        className="pointer-events-none relative h-full w-full object-contain object-top"
        aria-hidden
      />
    </>
  );
}

function HeroGlow() {
  return (
    <svg className="pointer-events-none absolute inset-x-0 bottom-2 h-12 w-full text-white" viewBox="0 0 1000 64" preserveAspectRatio="none" aria-hidden>
      <path d="M0 36C170 14 290 52 470 30C660 8 790 48 1000 22" fill="none" stroke="currentColor" strokeOpacity="0.4" strokeWidth="1.2" />
      <path d="M0 50C190 30 320 58 520 40C720 22 840 54 1000 36" fill="none" stroke="currentColor" strokeOpacity="0.22" strokeWidth="1" />
    </svg>
  );
}

function Empty({ children }: { children: string }) {
  return <p className="mt-6 text-sm text-casa-ink/60">{children}</p>;
}
