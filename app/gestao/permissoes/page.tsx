"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function PermissoesRedirectPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/gestao/usuarios");
  }, [router]);
  return <p className="px-4 py-6 text-sm text-lotus-600">Abrindo usuários…</p>;
}
