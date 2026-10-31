import type { AuthorizationContext } from "@/lib/auth/authorization";
import {
  canAccessClinicManagement,
  hasStaffRole,
  isClinicStaff,
  isPatientPortalUser,
  uniqueStaffRoles,
} from "@/lib/auth/access";
import { roleLabels } from "@/lib/auth/app-nav";
import { PhysicianPanel } from "@/components/dashboard/PhysicianPanel";
import { DashboardCardGrid } from "@/components/dashboard/DashboardCardGrid";
import type { PanelCardDef } from "@/lib/dashboard/panel-preferences";

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

const GESTAO_CARDS: PanelCardDef[] = [
  {
    id: "rooms",
    title: "Salas e Locações",
    note: "Salas, locações e contratos.",
    href: "/app/rooms",
  },
  {
    id: "clinical-contracts",
    title: "Contratos clínicos",
    note: "Obstetrícia e procedimentos.",
    href: "/app/clinical-contracts",
  },
  {
    id: "people",
    title: "Pessoas",
    note: "Profissionais, especialidades e funcionários.",
    href: "/app/people",
  },
  {
    id: "inventory",
    title: "Estoques",
    note: "Materiais, lotes e equipamentos.",
    href: "/app/inventory",
  },
  {
    id: "reports",
    title: "Relatórios",
    note: "Indicadores operacionais.",
    href: "/app/reports",
  },
  {
    id: "admin",
    title: "Administração",
    note: "Usuários, organização e permissões.",
    href: "/app/admin",
  },
];

const OPS_DAY_CARDS: PanelCardDef[] = [
  { id: "agenda", title: "Agenda", note: "Atendimentos e salas do dia.", href: "/app/agenda" },
  { id: "patients", title: "Pacientes", note: "Cadastro e identificação.", href: "/app/patients" },
  {
    id: "relationship",
    title: "Central de Relacionamentos",
    note: "Fila de contatos e WhatsApp Web.",
    href: "/app/relationship",
  },
];

const SECRETARY_CARDS: PanelCardDef[] = [
  { id: "agenda", title: "Agenda", note: "Agendamento e confirmação.", href: "/app/agenda" },
  { id: "patients", title: "Pacientes", note: "Cadastro e identificação.", href: "/app/patients" },
  {
    id: "relationship",
    title: "Central de Relacionamentos",
    note: "Fila de contatos e WhatsApp Web.",
    href: "/app/relationship",
  },
  { id: "exams", title: "Exames", note: "Pedidos e resultados.", href: "/app/exams" },
  { id: "prescriptions", title: "Receitas", note: "Documentos emitidos.", href: "/app/prescriptions" },
];

export function RoleDashboard({ auth }: { auth: AuthorizationContext }) {
  const roles = uniqueStaffRoles(auth);
  const orgName = auth.organization?.tradeName ?? auth.organization?.legalName ?? null;
  const fullName = auth.profile?.fullName ?? auth.user.email ?? "";
  const userId = auth.user.id;
  const showPhysician = hasStaffRole(auth, "physician");
  const showManagers = canAccessClinicManagement(auth);
  const showSecretary = hasStaffRole(auth, "secretary");
  const showPatient = isPatientPortalUser(auth);
  const showClinicOps = isClinicStaff(auth);

  // C041: médica (inclui sócias OWNER+DOCTOR) usa painel operacional.
  // C070-C7: sem Administração da plataforma no Painel (fica em /app/system).
  if (showPhysician) {
    return (
      <div className="space-y-6">
        <PhysicianPanel auth={auth} />
        {showManagers ? (
          <DashboardCardGrid
            userId={userId}
            sectionId="physician-gestao"
            title="Gestão Clínica"
            cards={GESTAO_CARDS}
          />
        ) : null}
        <p className="text-xs text-lotus-600">
          {orgName ?? "Casa Florescer"}
          {roles.length ? ` · ${roleLabels(roles)}` : ""}
          {fullName ? ` · ${fullName}` : ""}
        </p>
      </div>
    );
  }

  if (showManagers) {
    return (
      <div className="space-y-6">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-lotus-500">Painel</p>
          <h1 className="page-title mt-1">Gestão da clínica</h1>
          <WelcomeLine orgName={orgName} roles={roles} fullName={fullName} />
        </div>

        <DashboardCardGrid
          userId={userId}
          sectionId="gestao-ops"
          title="Operação do dia"
          cards={OPS_DAY_CARDS}
        />
        <DashboardCardGrid
          userId={userId}
          sectionId="gestao-admin"
          title="Gestão"
          cards={GESTAO_CARDS}
        />
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

        <DashboardCardGrid
          userId={userId}
          sectionId="secretaria"
          title="Operação"
          cards={SECRETARY_CARDS}
        />
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

      {showPatient ? (
        <DashboardCardGrid
          userId={userId}
          sectionId="portal"
          title="Meu portal"
          cards={[
            {
              id: "portal",
              title: "Portal",
              note: "Consultas, documentos e exames.",
              href: "/app/portal",
            },
          ]}
        />
      ) : null}

      {auth.isSystemAdmin && !showClinicOps && !showPatient ? (
        <DashboardCardGrid
          userId={userId}
          sectionId="platform-only"
          title="Plataforma"
          cards={[
            {
              id: "system",
              title: "Plataforma",
              note: "Organizações, usuários e auditoria técnica.",
              href: "/app/system",
            },
          ]}
        />
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
