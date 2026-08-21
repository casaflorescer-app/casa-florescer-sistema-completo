import Link from "next/link";
import { RedirectIfSession } from "@/components/layout/StaticAuthGates";
import { publicAsset } from "@/lib/hosting";
import { LoginForm } from "./ui";

export default function LoginPage() {
  const fundo = publicAsset("/images/logo-fundo.png");

  return (
    <main className="relative min-h-[100dvh] overflow-hidden bg-[#FAF3F4]">
      <RedirectIfSession />

      <div
        className="pointer-events-none absolute inset-0 bg-auto bg-center bg-no-repeat opacity-20"
        style={{ backgroundImage: `url('${fundo}')` }}
        aria-hidden
      />

      <div className="relative z-10 flex min-h-[100dvh] items-center justify-center px-6 py-10">
        <div className="w-full max-w-md rounded-2xl border border-white/50 bg-white/60 p-8 shadow-2xl backdrop-blur-lg">
          <h1 className="text-center text-2xl font-semibold tracking-tight text-rose-900">
            Casa Florescer
          </h1>
          <p className="mt-1 text-center text-sm text-rose-900/70">
            Cuidado ginecológico e obstétrico
          </p>
          <LoginForm />
          <p className="mt-6 text-center text-sm text-rose-900/80">
            <Link
              href="/login/criar"
              className="font-medium underline-offset-2 hover:underline"
            >
              Criar conta
            </Link>
            <span className="text-rose-900/50"> — somente pacientes</span>
          </p>
          <p className="mt-6 text-center text-xs leading-relaxed text-rose-900/50">
            Colaboradoras recebem o acesso pela casa. Não abra conta de staff por
            aqui.
          </p>
        </div>
      </div>
    </main>
  );
}
