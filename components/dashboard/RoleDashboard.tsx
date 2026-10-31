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

function WelcomeLine({
  orgName,
  roles,
  fullName,
}: {
  orgName: string | null;
  roles: ReturnType<typeof uniqueStaffRoles>;
  fullName: string;
}) {
  return (
    <p className="page-sub mt-2">
      {orgName ?? "Casa Florescer"}
      {roles.length ? ` · ${roleLabels(roles)}` : ""}
      {fullName ? ` · ${fullName}` : ""}
    </p>
  );
}

export function RoleDashboard({ auth }: { auth: AuthorizationContext }) {
  const roles = uniqueStaffRoles(auth);
  const orgName = auth.organization?.tradeName ?? auth.organization?.legalName ?? null;
  const fullName = auth.profile?.fullName ?? auth.user.email ?? "";
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
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <DashCard
                title="Salas e Locações"
                note="Salas, aluguéis e contratos de locação."
                href="/app/rooms"
              />
              <DashCard
                title="Contratos clínicos"
                note="Obstetrícia e procedimentos."
                href="/app/clinical-contracts"
              />
              <DashCard
                title="Pessoas"
                note="Profissionais, especialidades e funcionários."
                href="/app/people"
              />
              <DashCard title="Estoques" note="Insumos, farmácia e equipamentos." href="/app/inventory" />
              <DashCard title="Relatórios" note="Indicadores operacionais." href="/app/reports" />
              <DashCard title="Administração" note="Usuários, organização e permissões." href="/app/admin" />
            </div>
          </section>
        ) : null}
        <p className="text-xs text-lotus-600">
          {orgName ?? "Casa Florescer"}
          {roles.length ? ` · ${roleLabels(roles)}` : ""}
          {fullName ? ` · ${fullName}` : ""}
        </p>
      </div>
    );
  }

  // C068 / C070-C4.1 — Gestão: atalhos alinhados à sidebar (sem duplicar Salas/Aluguéis).
  if (showManagers) {
    return (
      <div className="space-y-6">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-lotus-500">Painel</p>
          <h1 className="page-title mt-1">Gestão da clínica</h1>
          <WelcomeLine orgName={orgName} roles={roles} fullName={fullName} />
        </div>

        {auth.isSystemAdmin ? <PlatformStatsCards /> : null}

        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-lotus-500">
            Operação do dia
          </h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <DashCard title="Agenda" note="Atendimentos e salas do dia." href="/app/agenda" />
            <DashCard title="Pacientes" note="Cadastro e identificação." href="/app/patients" />
            <DashCard
              title="Central de Relacionamentos"
              note="Fila de contatos e WhatsApp Web."
              href="/app/relationship"
            />
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-lotus-500">
            Gestão
          </h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <DashCard
              title="Salas e Locações"
              note="Salas, aluguéis e contratos de locação."
              href="/app/rooms"
            />
            <DashCard
              title="Contratos clínicos"
              note="Obstetrícia e procedimentos."
              href="/app/clinical-contracts"
            />
            <DashCard
              title="Pessoas"
              note="Profissionais, especialidades e funcionários."
              href="/app/people"
            />
            <DashCard title="Estoques" note="Materiais, lotes e equipamentos." href="/app/inventory" />
            <DashCard title="Relatórios" note="Indicadores operacionais." href="/app/reports" />
            <DashCard title="Administração" note="Usuários, organização e permissões." href="/app/admin" />
          </div>
        </section>
      </div>
    );
  }

  if (showSecretary) {
    return (
      <div className="space-y-6">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-lotus-500">Painel</p>
          <h1 className="page-title mt-1">Secretaria</h1>
          <WelcomeLine orgName={orgName} roles={roles} fullName={fullName} />
        </div>

        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-lotus-500">
            Operação
          </h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <DashCard title="Agenda" note="Agendamento e confirmação." href="/app/agenda" />
            <DashCard title="Pacientes" note="Cadastro e identificação." href="/app/patients" />
            <DashCard
              title="Central de Relacionamentos"
              note="Fila de contatos e WhatsApp Web."
              href="/app/relationship"
            />
            <DashCard title="Exames" note="Pedidos e resultados." href="/app/exams" />
            <DashCard title="Receitas" note="Documentos emitidos." href="/app/prescriptions" />
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-lotus-500">Painel</p>
        <h1 className="page-title mt-1">Visão geral</h1>
        <WelcomeLine orgName={orgName} roles={roles} fullName={fullName} />
      </div>

      {auth.isSystemAdmin ? <PlatformStatsCards /> : null}

      {showPatient ? (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-lotus-500">
            Meu portal
          </h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <DashCard title="Portal" note="Consultas, documentos e exames." href="/app/portal" />
          </div>
        </section>
      ) : null}

      {auth.isSystemAdmin && !showClinicOps && !showPatient ? (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-lotus-500">
            Plataforma
          </h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <DashCard
              title="Plataforma"
              note="Organizações, usuários e auditoria técnica."
              href="/app/system"
            />
          </div>
        </section>
      ) : null}

      {!auth.isSystemAdmin && !showClinicOps && !showPatient ? (
        <section className="card text-sm text-lotus-800">
          <p>
            Sua conta está autenticada, mas ainda não possui vínculo operacional na clínica. Peça à
            administração para liberar o acesso adequado.
          </p>
        </section>
      ) : null}
    </div>
  );
}
