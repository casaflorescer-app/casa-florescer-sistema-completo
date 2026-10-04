"use client";

import { RelationshipCenter } from "@/components/relationship/RelationshipCenter";
import { useAuth } from "@/components/auth/AuthProvider";
import { usePracticeUi } from "@/components/layout/PracticeUi";

export default function ComunicacaoPage() {
  const { authorization, authorizationLoading } = useAuth();
  const { selectedPracticeId } = usePracticeUi();

  const membership = authorization?.memberships.find(
    (item) => item.practiceId === selectedPracticeId,
  );
  const organizationId =
    membership?.practice?.organizationId ?? authorization?.organization?.id ?? null;

  const canManage = Boolean(
    authorization &&
      selectedPracticeId &&
      authorization.memberships.some(
        (item) =>
          item.practiceId === selectedPracticeId &&
          (item.role === "owner" || item.role === "admin" || item.role === "secretary"),
      ),
  );

  if (authorizationLoading) {
    return <p className="page-sub">Carregando Central de Relacionamentos…</p>;
  }

  if (!organizationId || !selectedPracticeId) {
    return (
      <section className="card">
        <h1 className="page-title">Central de Relacionamentos</h1>
        <p className="page-sub mt-2">Selecione uma prática para continuar.</p>
      </section>
    );
  }

  return (
    <RelationshipCenter
      organizationId={organizationId}
      practiceId={selectedPracticeId}
      canManage={canManage}
    />
  );
}
