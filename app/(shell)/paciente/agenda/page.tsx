"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function PacienteAgendaLegacyRedirectPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/app/portal");
  }, [router]);
  return <p className="page-sub">Redirecionando para o portal da paciente…</p>;
}
