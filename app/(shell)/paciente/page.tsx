"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Portal legado — superfície oficial: /app/portal (C038). */
export default function PacienteLegacyRedirectPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/app/portal");
  }, [router]);
  return <p className="page-sub">Redirecionando para o portal da paciente…</p>;
}
