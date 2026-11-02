import type { AuthorizationContext } from "@/lib/auth/authorization";
import {
  canAccessClinicManagement,
  hasStaffRole,
  isClinicStaff,
  isPatientPortalUser,
  uniqueStaffRoles,
} from "@/lib/auth/access";
import { roleLabels } from "@/lib/auth/app-nav";
import { HomeDashboard } from "@/components/dashboard/HomeDashboard";
import { DashboardCardGrid } from "@/components/dashboard/DashboardCardGrid";

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
  const userId = auth.user.id;
  const showPhysician = hasStaffRole(auth, "physician");
  const showManagers = canAccessClinicManagement(auth);
  const showSecretary = hasStaffRole(auth, "secretary");
  const showPatient = isPatientPortalUser(auth);
  const showClinicOps = isClinicStaff(auth);

  // C041: médica (inclui sócias OWNER+DOCTOR) usa painel operacional.
  // C070-C7: sem Administração da plataforma no Painel (fica em /app/system).
  if (showPhysician || showManagers || showSecretary) {
    return <HomeDashboard auth={auth} />;
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
