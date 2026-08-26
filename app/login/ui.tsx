"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Eye, EyeOff, Lock, User } from "lucide-react";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/client";
import { mapAuthError } from "@/lib/auth/errors";
import { AUTHENTICATED_HOME } from "@/lib/auth/paths";

const inputClass =
  "w-full rounded-xl border border-rose-100 bg-white py-3 pl-11 pr-4 text-sm text-rose-900 outline-none transition placeholder:text-rose-900/35 focus:border-rose-300 focus:ring-2 focus:ring-rose-300/70";

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function enter(event: React.FormEvent) {
    event.preventDefault();
    setError("");

    const email = login.trim().toLowerCase();
    if (!email || !isValidEmail(email)) {
      setError("Informe um e-mail válido.");
      return;
    }
    if (!password) {
      setError("Informe sua senha.");
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
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (signInError) {
        setError(mapAuthError(signInError, "Não foi possível entrar. Tente novamente."));
        setBusy(false);
        return;
      }

      const next = searchParams.get("next");
      const destination =
        next && next.startsWith("/") && !next.startsWith("//") ? next : AUTHENTICATED_HOME;
      router.replace(destination);
      router.refresh();
    } catch (err) {
      setError(mapAuthError(err, "Não foi possível entrar. Tente novamente."));
      setBusy(false);
    }
  }

  return (
    <form onSubmit={enter} className="mt-6 w-full space-y-4 text-left">
      <label className="block text-sm font-medium text-rose-900">
        E-mail
        <span className="relative mt-1.5 block">
          <User
            className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#B76E79]"
            aria-hidden
          />
          <input
            name="login"
            type="email"
            inputMode="email"
            autoComplete="username"
            value={login}
            onChange={(event) => setLogin(event.target.value)}
            className={inputClass}
            placeholder="seu e-mail"
            required
          />
        </span>
      </label>

      <label className="block text-sm font-medium text-rose-900">
        Senha
        <span className="relative mt-1.5 block">
          <Lock
            className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#B76E79]"
            aria-hidden
          />
          <input
            name="password"
            type={showPassword ? "text" : "password"}
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className={`${inputClass} pr-11`}
            placeholder="••••••••"
            required
          />
          <button
            type="button"
            onClick={() => setShowPassword((open) => !open)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-[#B76E79] hover:text-[#9A5B64]"
            aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
          >
            {showPassword ? (
              <EyeOff className="h-4 w-4" />
            ) : (
              <Eye className="h-4 w-4" />
            )}
          </button>
        </span>
      </label>

      {error ? <p className="text-sm text-rose-800">{error}</p> : null}

      <p className="text-center">
        <a
          href="/login/esqueci-senha"
          className="text-sm font-medium text-[#9B406C] underline-offset-2 hover:underline"
        >
          Esqueceu sua senha?
        </a>
      </p>

      <button
        type="submit"
        disabled={busy}
        className="w-full rounded-xl bg-[#B76E79] py-3.5 font-semibold text-white shadow-lg shadow-[#B76E79]/25 transition hover:bg-[#9A5B64] disabled:opacity-60"
      >
        {busy ? "Entrando…" : "Entrar"}
      </button>
    </form>
  );
}
