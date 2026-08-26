import Link from "next/link";
import { PlatformBanner } from "@/components/platform/Ui";
import { PlatformStatsCards } from "@/components/platform/PlatformStatsCards";

const LINKS = [
  { href: "/app/system/organizations", label: "Organizações" },
  { href: "/app/system/users", label: "Usuários da plataforma" },
  { href: "/app/system/audit", label: "Auditoria técnica" },
  { href: "/app/system/settings", label: "Configurações do sistema" },
];

export default function SystemHomePage() {
  return (
    <div>
      <PlatformBanner
        title="Administração da plataforma"
        description="Área técnica do SYSTEM_ADMIN. Não concede acesso clínico automático."
      />
      <PlatformStatsCards />
      <nav className="mt-6 grid gap-3 sm:grid-cols-2">
        {LINKS.map((item) => (
          <Link key={item.href} href={item.href} className="card block hover:border-lotus-200">
            {item.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
