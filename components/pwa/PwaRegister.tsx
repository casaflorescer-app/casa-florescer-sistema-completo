"use client";

import { useEffect } from "react";
import { isStaticHosting, publicBasePath } from "@/lib/hosting";

export function PwaRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    if (isStaticHosting()) return;
    const swPath = `${publicBasePath()}/sw.js`;
    navigator.serviceWorker.register(swPath).catch(() => undefined);
  }, []);
  return null;
}
