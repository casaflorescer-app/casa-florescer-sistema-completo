import { AdminSubnav } from "@/components/clinic-admin/AdminSubnav";
import { PageHeader } from "@/components/ui/PageHeader";
import { ExternalServiceLink } from "@/components/ui/ExternalServiceLink";
import {
  getChatwootUrl,
  getEvolutionManagerUrl,
} from "@/lib/integrations/external-services";

export default function AdminIntegrationsPage() {
  const chatwootUrl = getChatwootUrl();
  const evolutionUrl = getEvolutionManagerUrl();

  return (
    <div>
      <PageHeader
        eyebrow="Administração da clínica"
        title="Integrações"
        description="Serviços externos utilizados pela clínica. Cada botão abre o sistema correspondente em uma nova aba."
      />
      <div className="mt-4">
        <AdminSubnav active="integrations" />
      </div>

      <div className="mt-2 grid gap-3 sm:grid-cols-2">
        <article className="card flex flex-col gap-4">
          <div>
            <h2 className="font-semibold text-lotus-900">Chatwoot</h2>
            <p className="mt-1 text-sm text-lotus-600">
              Atendimento e relacionamento com pacientes.
            </p>
          </div>
          <ExternalServiceLink href={chatwootUrl} label="Abrir Chatwoot" />
        </article>

        <article className="card flex flex-col gap-4">
          <div>
            <h2 className="font-semibold text-lotus-900">WhatsApp</h2>
            <p className="mt-1 text-sm text-lotus-600">
              Administração da conexão WhatsApp (Evolution Manager).
            </p>
          </div>
          <ExternalServiceLink href={evolutionUrl} label="Abrir WhatsApp Manager" />
        </article>
      </div>
    </div>
  );
}
