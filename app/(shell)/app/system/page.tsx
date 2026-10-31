import Link from "next/link";
import { PlatformBanner } from "@/components/platform/Ui";
import { PlatformStatsCards } from "@/components/platform/PlatformStatsCards";
import { SystemSubnav } from "@/components/platform/SystemSubnav";

const CARDS = [
  {
    href: "/app/system/organizations",
    title: "Organizações",
    note: "Gerencie as organizações cadastradas na plataforma.",
  },
  {
    href: "/app/system/users",
    title: "Usuários da plataforma",
    note: "Administração dos usuários com acesso administrativo à plataforma.",
  },
  {
    href: "/app/system/audit",
    title: "Auditoria técnica",
    note: "Consulte eventos técnicos e administrativos da plataforma.",
  },
] as const;

export default function SystemHomePage() {
  return (
    <div>
      <PlatformBanner
        title="Plataforma"
        description="Administração técnica multi-organização. Não concede acesso clínico automático e é distinta da Administração da clínica."
      />
      <SystemSubnav active="hub" />
      <PlatformStatsCards />
      <nav className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3" aria-label="Áreas da plataforma">
        {CARDS.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="card block transition-colors hover:border-lotus-200"
          >
            <p className="font-semibold text-lotus-900">{item.title}</p>
            <p className="mt-1 text-sm text-lotus-600">{item.note}</p>
            <p className="mt-3 text-sm font-medium text-lotus-800">Abrir →</p>
          </Link>
        ))}
      </nav>
    </div>
  );
}
