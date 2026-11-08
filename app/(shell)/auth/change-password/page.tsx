"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { BrandMark } from "@/components/layout/BrandMark";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/client";
import { mapAuthError } from "@/lib/auth/errors";
import { AUTHENTICATED_HOME } from "@/lib/auth/paths";
import { userMustChangePassword } from "@/lib/auth/must-change-password";

export default function ChangePasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!isSupabaseConfigured()) {
      setError("Autenticação ainda não está configurada neste ambiente.");
      setReady(true);
      return;
    }
    const supabase = createClient();
    if (!supabase) {
      setError("Autenticação ainda não está configurada neste ambiente.");
      setReady(true);
      return;
    }
    void supabase.auth.getUser().then(({ data }) => {
      if (!data.user) {
        window.location.replace("/login?next=/auth/change-password");
        return;
      }
      if (!userMustChangePassword(data.user)) {
        router.replace(AUTHENTICATED_HOME);
        return;
      }
      setReady(true);
    });
  }, [router]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    if (password.length < 8) {
      setError("A senha precisa ter pelo menos 8 caracteres.");
      return;
    }
    if (password !== confirm) {
      setError("As senhas não coincidem.");
      return;
    }
    const supabase = createClient();
    if (!supabase) {
      setError("Autenticação ainda não está configurada neste ambiente.");
      return;
    }

    setBusy(true);
    try {
      const { error: updateError } = await supabase.auth.updateUser({
        password,
        data: { must_change_password: false },
      });
      if (updateError) {
        setError(mapAuthError(updateError, "Não foi possível atualizar a senha."));
        setBusy(false);
        return;
      }
      window.location.assign(AUTHENTICATED_HOME);
    } catch (err) {
      setError(mapAuthError(err, "Não foi possível atualizar a senha."));
      setBusy(false);
    }
  }

  if (!ready) {
    return (
      <main className="view-enter mx-auto flex min-h-[100dvh] max-w-md flex-col justify-center px-6 py-10">
        <p className="text-sm text-lotus-600">Verificando sessão…</p>
      </main>
    );
  }

  return (
    <main className="view-enter mx-auto flex min-h-[100dvh] max-w-md flex-col justify-center px-6 py-10">
      <BrandMark />
      <h1 className="mt-8 text-2xl font-semibold text-lotus-900">Trocar senha provisória</h1>
      <p className="mt-2 text-sm text-lotus-600">
        Por segurança, defina uma senha nova antes de usar o sistema. A senha que você recebeu
        pelo WhatsApp não deve continuar em uso.
      </p>
      <form className="mt-8 space-y-4" onSubmit={submit}>
        <label className="block text-sm font-medium text-lotus-800">
          Nova senha
          <input
            required
            type="password"
            autoComplete="new-password"
            minLength={8}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="mt-1.5 w-full rounded-2xl border border-lotus-200 px-4 py-3"
          />
        </label>
        <label className="block text-sm font-medium text-lotus-800">
          Confirmar senha
          <input
            required
            type="password"
            autoComplete="new-password"
            minLength={8}
            value={confirm}
            onChange={(event) => setConfirm(event.target.value)}
            className="mt-1.5 w-full rounded-2xl border border-lotus-200 px-4 py-3"
          />
        </label>
        {error ? <p className="text-sm text-rose-800">{error}</p> : null}
        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-2xl bg-lotus-700 py-3.5 font-semibold text-white disabled:opacity-60"
        >
          {busy ? "Salvando…" : "Salvar e continuar"}
        </button>
      </form>
    </main>
  );
}
