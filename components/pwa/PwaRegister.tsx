"use client";

import { useEffect } from "react";
import { isStaticHosting, publicBasePath } from "@/lib/hosting";

/**
 * Registra SW estático-only. Não implementa offline clínico.
 * Atualização: skipWaiting no SW + claim; sem forçar reload durante atendimento.
 */
export function PwaRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    if (isStaticHosting()) return;
    const swPath = `${publicBasePath()}/sw.js`;
    navigator.serviceWorker.register(swPath).catch(() => undefined);
  }, []);
  return null;
}
