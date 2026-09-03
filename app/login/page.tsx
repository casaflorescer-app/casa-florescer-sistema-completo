import { Suspense } from "react";
import Link from "next/link";
import { Playfair_Display } from "next/font/google";
import { RedirectIfSession } from "@/components/layout/StaticAuthGates";
import { publicAsset } from "@/lib/hosting";
import { LoginForm } from "./ui";

const playfair = Playfair_Display({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
});

export default function LoginPage() {
  const fundo = publicAsset("/images/recepcao-fundo.jpg");
  const logo = publicAsset("/brand/logo-florescer.png");

  return (
    <main className="relative flex min-h-screen items-center justify-center px-4 py-10">
      <RedirectIfSession />

      <div
        className="absolute inset-0 bg-cover bg-center"
        style={{ backgroundImage: `url('${fundo}')` }}
        aria-hidden
      />
      <div className="absolute inset-0 bg-[#4A1D34]/35" aria-hidden />

      <div className="relative z-10 w-full max-w-md rounded-2xl border border-[#9B406C]/20 bg-[#F7E3E9]/85 p-8 shadow-2xl backdrop-blur-lg">
        <div className="flex flex-col items-center text-center">
          <img
            src={logo}
            alt="Casa Florescer"
            width={88}
            height={88}
            className="h-20 w-20 bg-transparent object-contain"
          />
          <h1
            className={`${playfair.className} mt-4 text-2xl font-semibold tracking-[0.18em] text-[#9B406C]`}
          >
            CASA FLORESCER
          </h1>
          <p className="mt-1 text-sm text-[#9B406C]/80">
            Clínica de Ginecologia e Obstetrícia
          </p>
          <p className="mt-3 text-sm font-medium text-rose-900">
            Bem-vinda! Acesse sua conta.
          </p>

          <Suspense fallback={<p className="mt-6 text-sm text-rose-900/70">Carregando…</p>}>
            <LoginForm />
          </Suspense>

          <div className="mt-6 space-y-1.5 text-sm">
            <p>
              <Link
                href="/login/criar"
                className="font-medium text-[#9B406C] underline-offset-2 hover:underline"
              >
                Criar nova conta
              </Link>
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}
