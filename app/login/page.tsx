import Link from "next/link";
import { redirect } from "next/navigation";
import { BrandMark } from "@/components/layout/BrandMark";
import { getSessionContext } from "@/lib/auth/session";
import { homeForRole } from "@/lib/rbac";
import { LoginActions } from "./ui";

export default async function LoginPage() {
  const session = await getSessionContext();
  if (session) redirect(homeForRole(session.uiRole));

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 py-10">
      <BrandMark />
      <h1 className="mt-8 page-title">Entrar no sistema</h1>
      <p className="page-sub">
        Cada perfil vê só o que precisa. Pacientes não acessam prontuário de
        outras pessoas; a recepção não abre notas clínicas.
      </p>
      <form className="mt-8 space-y-3">
        <label className="block text-sm font-medium text-lotus-800">
          E-mail
          <input
            name="email"
            type="email"
            className="mt-1 w-full rounded-xl border border-lotus-200 bg-white px-3 py-2"
            placeholder="seu@email"
          />
        </label>
        <label className="block text-sm font-medium text-lotus-800">
          Senha
          <input
            name="password"
            type="password"
            className="mt-1 w-full rounded-xl border border-lotus-200 bg-white px-3 py-2"
          />
        </label>
        <button
          type="button"
          className="w-full rounded-xl bg-lotus-700 py-3 font-semibold text-white"
        >
          Entrar
        </button>
      </form>
      <p className="mt-8 text-xs font-semibold uppercase tracking-wide text-lotus-500">
        Prévia dos módulos (sem dados reais)
      </p>
      <LoginActions />
      <p className="mt-6 text-center text-sm text-lotus-600">
        <Link href="/" className="underline-offset-2 hover:underline">
          Voltar
        </Link>
      </p>
    </main>
  );
}
