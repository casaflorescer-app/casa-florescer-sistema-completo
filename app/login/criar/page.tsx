"use client";

import { useState } from "react";
import Link from "next/link";
import { BrandMark } from "@/components/layout/BrandMark";

export default function CriarContaPage() {
  const [done, setDone] = useState(false);

  return (
    <main className="view-enter mx-auto flex min-h-[100dvh] max-w-md flex-col justify-center px-6 py-10">
      <BrandMark />
      <h1 className="mt-8 text-2xl font-semibold text-lotus-900">Criar conta</h1>
      <p className="mt-2 text-sm text-lotus-600">
        Acesso da paciente: consultas, exames e envio de arquivos. Médicas e
        secretárias não se cadastram nesta tela.
      </p>
      {done ? (
        <p className="card mt-8 text-sm text-lotus-800">
          Pedido registrado. A recepção confirma seu cadastro e libera o acesso.
        </p>
      ) : (
        <form
          className="mt-8 space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            setDone(true);
          }}
        >
          <label className="block text-sm font-medium text-lotus-800">
            Nome
            <input required className="mt-1.5 w-full rounded-2xl border border-lotus-200 px-4 py-3" />
          </label>
          <label className="block text-sm font-medium text-lotus-800">
            Login (e-mail)
            <input required type="email" className="mt-1.5 w-full rounded-2xl border border-lotus-200 px-4 py-3" />
          </label>
          <label className="block text-sm font-medium text-lotus-800">
            Senha
            <input required type="password" minLength={6} className="mt-1.5 w-full rounded-2xl border border-lotus-200 px-4 py-3" />
          </label>
          <button type="submit" className="w-full rounded-2xl bg-lotus-700 py-3.5 font-semibold text-white">
            Criar conta
          </button>
        </form>
      )}
      <p className="mt-6 text-center text-sm">
        <Link href="/login" className="text-lotus-700 hover:underline">
          Voltar ao login
        </Link>
      </p>
    </main>
  );
}
