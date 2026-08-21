"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { UiRole } from "@/lib/types/domain";
import { homeForRole } from "@/lib/rbac";
import { defaultModulesForRole } from "@/lib/permissions";
import { setPreviewRole } from "@/lib/preview-api";

const DEMO: Record<string, UiRole> = {
  "secretaria@florescer.clinica": "secretary",
  "medica@florescer.clinica": "physician",
  "admin@florescer.clinica": "manager",
  "paciente@florescer.clinica": "patient",
};

const fieldClass =
  "mt-1.5 w-full rounded-xl border-0 bg-white/70 px-4 py-3 text-rose-900 outline-none ring-1 ring-white/60 transition placeholder:text-rose-900/35 focus:ring-2 focus:ring-rose-400";

export function LoginForm() {
  const router = useRouter();
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function enter(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    setBusy(true);
    const role = DEMO[login.trim().toLowerCase()];
    if (!role || password !== "florescer") {
      setBusy(false);
      setError("Login ou senha inválidos.");
      return;
    }
    await setPreviewRole(role);
    router.push(homeForRole(role, defaultModulesForRole(role)));
    router.refresh();
  }

  return (
    <form onSubmit={enter} className="mt-8 space-y-4">
      <label className="block text-sm font-medium text-rose-900">
        Login
        <input
          name="login"
          type="email"
          inputMode="email"
          autoComplete="username"
          value={login}
          onChange={(e) => setLogin(e.target.value)}
          className={fieldClass}
          placeholder="seu acesso"
        />
      </label>
      <label className="block text-sm font-medium text-rose-900">
        Senha
        <input
          name="password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className={fieldClass}
        />
      </label>
      {error ? <p className="text-sm text-rose-800">{error}</p> : null}
      <button
        type="submit"
        disabled={busy}
        className="w-full rounded-full bg-[#B76E79] py-3.5 font-semibold text-white shadow-lg shadow-[#B76E79]/25 transition hover:bg-[#9A5B64] disabled:opacity-60"
      >
        {busy ? "Entrando…" : "Entrar"}
      </button>
    </form>
  );
}
