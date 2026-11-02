"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { CalendarDays, Heart, Plus, Users, Wallet } from "lucide-react";
import type { AuthorizationContext } from "@/lib/auth/authorization";
import { hasStaffRole, isClinicStaff } from "@/lib/auth/access";
import { loadHomeCasa, type HomeSnapshot } from "@/lib/casa/reads";
import { PatientPhotoThumb } from "@/components/patients/PatientPhotoThumb";

const WEEKDAY = new Intl.DateTimeFormat("pt-BR", { weekday: "short", timeZone: "America/Sao_Paulo" });
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
    <div className="space-y-5">
      <section className="relative overflow-hidden rounded-[2rem] bg-gradient-to-br from-casa-plum via-casa-lilac to-casa-rose px-6 py-8 text-white shadow-sm lg:px-10">
        <div className="relative z-10 max-w-xl">
          <p className="text-sm text-white/80">Olá, {firstName(fullName)}</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">Casa Florescer</h1>
          <p className="mt-3 max-w-md text-sm leading-6 text-white/90 sm:text-base">
            Cuidado integral à saúde da mulher, em todas as fases da sua vida.
          </p>
          {isClinicStaff(auth) ? (
            <Link
              href="/app/agenda"
              className="mt-6 inline-flex min-h-11 items-center gap-2 rounded-full bg-white px-5 text-sm font-semibold text-casa-plum shadow-sm hover:bg-casa-mist"
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
          className="pointer-events-none mx-auto mt-4 h-56 w-auto object-contain object-bottom sm:absolute sm:-right-4 sm:bottom-0 sm:mt-0 sm:h-[108%] sm:max-w-[42%]"
          aria-hidden
        />
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

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Metric
          icon={<CalendarDays className="h-5 w-5" aria-hidden />}
          label="Consultas hoje"
          value={snapshot ? snapshot.todayCount ?? "—" : null}
        />
        <Metric icon={<Users className="h-5 w-5" aria-hidden />} label="Pacientes" value={snapshot?.patients ?? null} />
        <Metric icon={<Heart className="h-5 w-5" aria-hidden />} label="Gestações em acompanhamento" value={snapshot?.pregnanciesInCare ?? null} />
        {includeFinance ? (
          <Metric
            icon={<Wallet className="h-5 w-5" aria-hidden />}
            label="Recebido no mês"
            value={snapshot ? money(snapshot.financeCents ?? 0) : null}
          />
        ) : null}
      </section>

      <section className="grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(16rem,0.8fr)]">
        <article className="rounded-3xl bg-white p-5 shadow-sm">
          <h2 className="text-base font-semibold text-casa-ink">Consultas nos últimos 7 dias</h2>
          {snapshot && snapshot.week.length > 0 ? <WeekBars days={snapshot.week} /> : <Empty>Sem consultas neste período.</Empty>}
        </article>
        <article className="rounded-3xl bg-white p-5 shadow-sm">
          <h2 className="text-base font-semibold text-casa-ink">Atendimentos por tipo</h2>
          {snapshot && snapshot.kinds.length > 0 ? <KindSplit kinds={snapshot.kinds} /> : <Empty>Sem atendimentos para distribuir.</Empty>}
        </article>
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        <article className="rounded-3xl bg-white p-5 shadow-sm">
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
        <article className="rounded-3xl bg-white p-5 shadow-sm">
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
        <article className="rounded-3xl bg-white p-5 shadow-sm">
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
    </div>
  );
}

function Metric({ icon, label, value }: { icon: ReactNode; label: string; value: number | string | null }) {
  return (
    <article className="rounded-3xl bg-white p-4 shadow-sm">
      <div className="flex items-center gap-2 text-casa-plum">
        {icon}
        <h2 className="text-sm font-medium text-casa-ink/70">{label}</h2>
      </div>
      <p className="mt-3 text-2xl font-semibold text-casa-ink">{value === null ? "…" : value}</p>
    </article>
  );
}

function Empty({ children }: { children: string }) {
  return <p className="mt-6 text-sm text-casa-ink/60">{children}</p>;
}

function WeekBars({ days }: { days: HomeSnapshot["week"] }) {
  const max = Math.max(...days.map((item) => item.count), 1);
  return (
    <div className="mt-6 flex h-40 items-end gap-2">
      {days.map((item) => (
        <div key={item.day} className="flex flex-1 flex-col items-center gap-2">
          <div className="flex h-28 w-full items-end">
            <div
              className="w-full rounded-t-lg bg-casa-lilac"
              style={{ height: `${Math.max(8, (item.count / max) * 100)}%` }}
              title={`${item.count}`}
            />
          </div>
          <span className="text-[11px] capitalize text-casa-ink/60">{WEEKDAY.format(new Date(`${item.day}T12:00:00-03:00`))}</span>
        </div>
      ))}
    </div>
  );
}

function KindSplit({ kinds }: { kinds: HomeSnapshot["kinds"] }) {
  const total = kinds.reduce((sum, item) => sum + item.count, 0);
  const consultation = kinds.find((item) => item.key === "consultation")?.count ?? 0;
  const procedure = kinds.find((item) => item.key === "procedure")?.count ?? 0;
  const consultationShare = total > 0 ? consultation / total : 0;
  const dash = 2 * Math.PI * 42;
  return (
    <div className="mt-6 flex items-center gap-6">
      <svg viewBox="0 0 120 120" className="h-28 w-28" role="img" aria-label={`${total} atendimentos`}>
        <circle cx="60" cy="60" r="42" fill="none" stroke="#F5F0F5" strokeWidth="14" />
        <circle
          cx="60"
          cy="60"
          r="42"
          fill="none"
          stroke="#57366E"
          strokeWidth="14"
          strokeDasharray={`${dash * consultationShare} ${dash}`}
          strokeLinecap="butt"
          transform="rotate(-90 60 60)"
        />
        <circle
          cx="60"
          cy="60"
          r="42"
          fill="none"
          stroke="#C884A5"
          strokeWidth="14"
          strokeDasharray={`${dash * (procedure / Math.max(total, 1))} ${dash}`}
          strokeDashoffset={-dash * consultationShare}
          transform="rotate(-90 60 60)"
        />
        <text x="60" y="58" textAnchor="middle" className="fill-casa-ink text-[18px] font-semibold">
          {total}
        </text>
        <text x="60" y="74" textAnchor="middle" className="fill-casa-ink/70 text-[9px]">
          Total
        </text>
      </svg>
      <ul className="space-y-2 text-sm text-casa-ink">
        <li>Consulta · {consultation}</li>
        <li>Procedimento · {procedure}</li>
      </ul>
    </div>
  );
}
