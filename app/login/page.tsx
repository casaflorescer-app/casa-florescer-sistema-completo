import Link from "next/link";
import { redirect } from "next/navigation";
import { BrandMark } from "@/components/layout/BrandMark";
import { getSessionContext } from "@/lib/auth/session";
import { homeForRole } from "@/lib/rbac";
import { LoginForm } from "./ui";

export default async function LoginPage() {
  const session = await getSessionContext();
  if (session) redirect(homeForRole(session.uiRole, session.permissions));

  return (
    <main className="view-enter mx-auto flex min-h-[100dvh] max-w-md flex-col justify-center px-6 py-10">
      <div className="flex justify-center">
        <BrandMark />
      </div>
      <h1 className="mt-8 text-center text-2xl font-semibold tracking-tight text-lotus-900">
        Casa Florescer
      </h1>
      <p className="mt-1 text-center text-sm text-lotus-600">
        Cuidado ginecológico e obstétrico
      </p>
      <LoginForm />
      <p className="mt-6 text-center text-sm text-lotus-700">
        <Link href="/login/criar" className="font-medium underline-offset-2 hover:underline">
          Criar conta
        </Link>
        <span className="text-lotus-500"> — somente pacientes</span>
      </p>
      <p className="mt-8 text-center text-xs leading-relaxed text-lotus-500">
        Colaboradoras recebem o acesso pela casa. Não abra conta de staff por aqui.
      </p>
    </main>
  );
}
