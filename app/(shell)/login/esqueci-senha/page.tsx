"use client";

import { useState } from "react";
import Link from "next/link";
import { BrandMark } from "@/components/layout/BrandMark";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/client";
import { mapResetError } from "@/lib/auth/errors";

export default function EsqueciSenhaPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    const value = email.trim().toLowerCase();
    if (!value) {
      setError("Informe o e-mail da conta.");
      return;
    }
    if (!isSupabaseConfigured()) {
      setError("Autenticação ainda não está configurada neste ambiente.");
      return;
    }
    const supabase = createClient();
    if (!supabase) {
      setError("Autenticação ainda não está configurada neste ambiente.");
      return;
    }

    setBusy(true);
    try {
      const redirectTo = `${window.location.origin}/auth/reset-password`;
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(value, {
        redirectTo,
      });
      if (resetError) {
        setError(mapResetError(resetError));
        setBusy(false);
        return;
      }
      setSent(true);
    } catch (err) {
      setError(mapResetError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="view-enter mx-auto flex min-h-[100dvh] max-w-md flex-col justify-center px-6 py-10">
      <BrandMark />
      <h1 className="mt-8 text-2xl font-semibold text-lotus-900">Esqueci a senha</h1>
      {sent ? (
        <p className="card mt-6 text-sm text-lotus-800">
          Se este e-mail estiver cadastrado, você receberá as instruções para
          redefinir a senha.
        </p>
      ) : (
        <form className="mt-8 space-y-4" onSubmit={submit}>
          <label className="block text-sm font-medium text-lotus-800">
            E-mail
            <input
              required
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="mt-1.5 w-full rounded-2xl border border-lotus-200 px-4 py-3"
            />
          </label>
          {error ? <p className="text-sm text-rose-800">{error}</p> : null}
          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-2xl bg-lotus-700 py-3.5 font-semibold text-white disabled:opacity-60"
          >
            {busy ? "Enviando…" : "Enviar instruções"}
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
