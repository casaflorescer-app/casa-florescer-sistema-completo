import Link from "next/link";
import type { AuthorizationContext } from "@/lib/auth/authorization";
import {
  canAccessClinicManagement,
  hasStaffRole,
  isClinicStaff,
  isPatientPortalUser,
  uniqueStaffRoles,
} from "@/lib/auth/access";
import { PlatformStatsCards } from "@/components/platform/PlatformStatsCards";
import { roleLabels } from "@/lib/auth/app-nav";
import { PhysicianPanel } from "@/components/dashboard/PhysicianPanel";

function DashCard({
  title,
  note,
  href,
}: {
  title: string;
  note: string;
  href?: string;
}) {
  const body = (
    <>
      <h3 className="font-semibold text-lotus-900">{title}</h3>
      <p className="mt-1 text-sm text-lotus-700">{note}</p>
    </>
  );
  if (!href) {
    return <article className="card">{body}</article>;
  }
  return (
    <Link href={href} className="card block transition-colors hover:border-lotus-200">
      {body}
    </Link>
  );
}

export function RoleDashboard({ auth }: { auth: AuthorizationContext }) {
  const roles = uniqueStaffRoles(auth);
  const orgName = auth.organization?.tradeName ?? auth.organization?.legalName ?? null;
  const showPhysician = hasStaffRole(auth, "physician");
  const showManagers = canAccessClinicManagement(auth);
  const showSecretary = hasStaffRole(auth, "secretary");
  const showPatient = isPatientPortalUser(auth);
  const showClinicOps = isClinicStaff(auth);

  // C041: médica (inclui sócias OWNER+DOCTOR) usa painel operacional.
  if (showPhysician) {
    return (
      <div className="space-y-6">
        {auth.isSystemAdmin ? <PlatformStatsCards /> : null}
        <PhysicianPanel auth={auth} />
        {showManagers ? (
          <section className="space-y-3">
            <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-lotus-500">
              Gestão Clínica
            </h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <DashCard title="Gestão de Salas" note="Salas e ocupação." href="/app/rooms" />
              <DashCard title="Aluguéis" note="Locação de salas." href="/app/rentals" />
              <DashCard title="Funcionários" note="Profissionais da prática." href="/app/professionals" />
              <DashCard title="Estoques" note="Insumos e farmácia." href="/app/inventory" />
            </div>
          </section>
        ) : null}
        <section className="card space-y-1 text-xs text-lotus-600">
          <p>
            {orgName ?? "Casa Florescer"}
            {roles.length ? ` · ${roleLabels(roles)}` : ""}
            {" · "}
            {auth.profile?.fullName ?? auth.user.email ?? "—"}
          </p>
        </section>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-title">Visão geral</h1>
        <p className="page-sub mt-2">
          {orgName ?? "Casa Florescer"}
          {roles.length ? ` · ${roleLabels(roles)}` : ""}
        </p>
      </div>

      <section className="card space-y-2 text-sm text-lotus-800">
        <h2 className="font-semibold text-lotus-900">Sessão</h2>
        <p>Usuário: {auth.profile?.fullName ?? auth.user.email ?? "—"}</p>
        <p>SYSTEM_ADMIN: {auth.isSystemAdmin ? "Sim" : "Não"}</p>
        <p>Portal da paciente: {showPatient ? "Sim" : "Não"}</p>
        <p>
          Práticas:{" "}
          {auth.memberships.length === 0
            ? "nenhuma"
            : auth.memberships
                .map((item) => `${item.practice?.name ?? item.practiceId} (${item.role})`)
                .join(" · ")}
        </p>
      </section>

      {auth.isSystemAdmin ? <PlatformStatsCards /> : null}

      {showManagers ? (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-lotus-500">
            Gestão Clínica
          </h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <DashCard title="Agenda do dia" note="Operação da clínica." href="/app/agenda" />
            <DashCard title="Pacientes" note="Cadastro administrativo." href="/app/patients" />
            <DashCard title="Gestão de Salas" note="Salas e ocupação." href="/app/rooms" />
            <DashCard title="Funcionários" note="Profissionais." href="/app/professionals" />
          </div>
        </section>
      ) : null}

      {showSecretary && !showManagers ? (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-lotus-500">
            Secretaria
          </h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <DashCard title="Agenda" note="Agendamento e confirmação." href="/app/agenda" />
            <DashCard title="Pacientes" note="Cadastro e identificação." href="/app/patients" />
            <DashCard title="Exames" note="Pedidos e resultados." href="/app/exams" />
            <DashCard
              title="Central de Relacionamentos"
              note="Fila operacional da secretaria."
              href="/app/relationship"
            />
          </div>
        </section>
      ) : null}

      {showPatient ? (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-lotus-500">
            Meu portal
          </h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <DashCard
              title="Próximas consultas"
              note="Somente os seus agendamentos."
              href="/app/portal"
            />
            <DashCard title="Exames" note="Somente os seus exames." href="/app/portal" />
            <DashCard title="Receitas" note="Somente as suas receitas." href="/app/portal" />
          </div>
        </section>
      ) : null}

      {!auth.isSystemAdmin && !showClinicOps && !showPatient ? (
        <section className="card text-sm text-lotus-800">
          <p>
            Usuário autenticado, sem vínculo clínico ou de paciente. Nenhuma área operacional foi
            liberada.
          </p>
        </section>
      ) : null}
    </div>
  );
}
