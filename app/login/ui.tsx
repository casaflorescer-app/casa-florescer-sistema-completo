"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, Lock, User } from "lucide-react";
import type { UiRole } from "@/lib/types/domain";
import { homeForRole } from "@/lib/rbac";
import { defaultModulesForRole } from "@/lib/permissions";
import { setPreviewRole, setPreviewUserId } from "@/lib/preview-api";
import { findDirectoryUserByEmail } from "@/lib/admin/directory";

const DEMO: Record<string, UiRole> = {
  "secretaria@florescer.clinica": "secretary",
  "medica@florescer.clinica": "physician",
  "admin@florescer.clinica": "manager",
  "paciente@florescer.clinica": "patient",
};

const inputClass =
  "w-full rounded-xl border border-rose-100 bg-white py-3 pl-11 pr-4 text-sm text-rose-900 outline-none transition placeholder:text-rose-900/35 focus:border-rose-300 focus:ring-2 focus:ring-rose-300/70";

export function LoginForm() {
  const router = useRouter();
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [hint, setHint] = useState("");
  const [busy, setBusy] = useState(false);

  async function enter(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    setHint("");
    setBusy(true);
    const email = login.trim().toLowerCase();
    const directory = findDirectoryUserByEmail(email);
    const role = directory?.uiRole ?? DEMO[email];
    if (!role || password !== "florescer") {
      setBusy(false);
      setError("Login ou senha inválidos.");
      return;
    }
    await setPreviewRole(role);
    setPreviewUserId(directory?.userId ?? `preview-${role}`);
    router.push(homeForRole(role, defaultModulesForRole(role)));
    router.refresh();
  }

  return (
    <form onSubmit={enter} className="mt-6 w-full space-y-4 text-left">
      <label className="block text-sm font-medium text-rose-900">
        Login
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
            placeholder="seu acesso"
          />
        </span>
      </label>

      <label className="block text-sm font-medium text-rose-900">
        Password
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
      {hint ? <p className="text-center text-sm text-rose-900/70">{hint}</p> : null}

      <p className="text-center">
        <button
          type="button"
          onClick={() =>
            setHint("Fale com a recepção da Casa Florescer para redefinir o acesso.")
          }
          className="text-sm font-medium text-[#9B406C] underline-offset-2 hover:underline"
        >
          Esqueceu sua senha?
        </button>
      </p>

      <button
        type="submit"
        disabled={busy}
        className="w-full rounded-xl bg-[#B76E79] py-3.5 font-semibold text-white shadow-lg shadow-[#B76E79]/25 transition hover:bg-[#9A5B64] disabled:opacity-60"
      >
        {busy ? "Entrando…" : "Sign In (Entrar)"}
      </button>
    </form>
  );
}
