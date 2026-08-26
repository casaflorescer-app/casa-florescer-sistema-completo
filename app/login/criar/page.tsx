import Link from "next/link";
import { BrandMark } from "@/components/layout/BrandMark";

export default function CriarContaPage() {
  return (
    <main className="view-enter mx-auto flex min-h-[100dvh] max-w-md flex-col justify-center px-6 py-10">
      <BrandMark />
      <h1 className="mt-8 text-2xl font-semibold text-lotus-900">Criar conta</h1>
      <p className="card mt-6 text-sm text-lotus-800">
        Cadastro de usuários será disponibilizado posteriormente. O acesso é
        liberado pela clínica.
      </p>
      <p className="mt-6 text-center text-sm">
        <Link href="/login" className="text-lotus-700 hover:underline">
          Voltar ao login
        </Link>
      </p>
    </main>
  );
}
