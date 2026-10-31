import { UsersPanel } from "@/components/platform/UsersPanel";
import { SystemSubnav } from "@/components/platform/SystemSubnav";
import { HubBackLink } from "@/components/ui/HubBackLink";

export default function SystemUsersPage() {
  return (
    <div>
      <HubBackLink href="/app/system" label="Voltar para Plataforma" />
      <SystemSubnav active="users" />
      <UsersPanel />
    </div>
  );
}
