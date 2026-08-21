"use client";

import { useState } from "react";

export default function PacienteCadastroPage() {
  const [saved, setSaved] = useState(false);

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaved(true);
  }

  return (
    <div>
      <h1 className="page-title">Atualizar cadastro</h1>
      <p className="page-sub">
        Confira telefone, e-mail e convênio. A recepção usa estes dados para
        confirmar consultas e avisar exames.
      </p>
      <form onSubmit={submit} className="card mt-6 max-w-lg space-y-4">
        <label className="block text-sm font-medium text-lotus-800">
          Nome completo
          <input
            name="name"
            defaultValue="Marina Alves"
            className="mt-1.5 w-full rounded-xl border border-lotus-200 bg-white px-3 py-2.5 text-sm outline-none ring-rose-400 focus:ring-2"
          />
        </label>
        <label className="block text-sm font-medium text-lotus-800">
          Telefone / WhatsApp
          <input
            name="phone"
            defaultValue="(11) 98888-0101"
            className="mt-1.5 w-full rounded-xl border border-lotus-200 bg-white px-3 py-2.5 text-sm outline-none ring-rose-400 focus:ring-2"
          />
        </label>
        <label className="block text-sm font-medium text-lotus-800">
          E-mail
          <input
            name="email"
            type="email"
            defaultValue="paciente@florescer.clinica"
            className="mt-1.5 w-full rounded-xl border border-lotus-200 bg-white px-3 py-2.5 text-sm outline-none ring-rose-400 focus:ring-2"
          />
        </label>
        <label className="block text-sm font-medium text-lotus-800">
          Convênio
          <input
            name="insurance"
            defaultValue="Particular"
            className="mt-1.5 w-full rounded-xl border border-lotus-200 bg-white px-3 py-2.5 text-sm outline-none ring-rose-400 focus:ring-2"
          />
        </label>
        <button
          type="submit"
          className="rounded-xl bg-rose-500 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-rose-600"
        >
          Salvar alterações
        </button>
        {saved ? (
          <p className="text-sm text-lotus-700">Cadastro atualizado.</p>
        ) : null}
      </form>
    </div>
  );
}
