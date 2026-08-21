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
      <label className="block text-sm font-medium text-lotus-800">
        Login
        <input
          name="login"
          type="email"
          inputMode="email"
          autoComplete="username"
          value={login}
          onChange={(e) => setLogin(e.target.value)}
          className="mt-1.5 w-full rounded-2xl border border-lotus-200 bg-white px-4 py-3 outline-none transition focus:border-lotus-500"
          placeholder="seu acesso"
        />
      </label>
      <label className="block text-sm font-medium text-lotus-800">
        Senha
        <input
          name="password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="mt-1.5 w-full rounded-2xl border border-lotus-200 bg-white px-4 py-3 outline-none transition focus:border-lotus-500"
        />
      </label>
      {error ? <p className="text-sm text-lotus-700">{error}</p> : null}
      <button
        type="submit"
        disabled={busy}
        className="w-full rounded-2xl bg-lotus-700 py-3.5 font-semibold text-white transition hover:bg-lotus-800 disabled:opacity-60"
      >
        {busy ? "Entrando…" : "Entrar"}
      </button>
    </form>
  );
}
