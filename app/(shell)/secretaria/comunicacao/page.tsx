"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Rota legada: a superfície oficial é /app/relationship (B3.2). */
export default function ComunicacaoLegacyRedirectPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/app/relationship");
  }, [router]);
  return <p className="page-sub">Redirecionando para a Central de Relacionamentos…</p>;
}
