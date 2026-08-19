import Link from "next/link";
import { redirect } from "next/navigation";
import { BrandMark } from "@/components/layout/BrandMark";
import { getSessionContext } from "@/lib/auth/session";
import { homeForRole } from "@/lib/rbac";

export default async function HomePage() {
  const session = await getSessionContext();
  if (session) redirect(homeForRole(session.uiRole, session.permissions));

  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col justify-center px-6">
      <BrandMark />
      <h1 className="mt-8 page-title">Casa Florescer</h1>
      <p className="page-sub">
        Sistema da casa: recepção compartilhada, prontuário isolado por
        consultório, portal da paciente e gestão de estoque e contratos.
      </p>
      <Link
        href="/login"
        className="mt-8 inline-flex w-fit rounded-xl bg-lotus-700 px-5 py-3 font-semibold text-white"
      >
        Entrar
      </Link>
    </main>
  );
}
