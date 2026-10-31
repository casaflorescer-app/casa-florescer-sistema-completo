"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { RelationshipCenter } from "@/components/relationship/RelationshipCenter";
import { useAuth } from "@/components/auth/AuthProvider";
import { usePracticeUi } from "@/components/layout/PracticeUi";

const VALID_TABS = new Set([
  "dashboard",
  "contact",
  "opportunities",
  "campaigns",
  "templates",
  "history",
  "preferences",
]);

function RelationshipPageInner() {
  const { authorization, authorizationLoading } = useAuth();
  const { selectedPracticeId } = usePracticeUi();
  const searchParams = useSearchParams();
  const tabParam = searchParams.get("tab");
  const initialTab =
    tabParam && VALID_TABS.has(tabParam)
      ? (tabParam as
          | "dashboard"
          | "contact"
          | "opportunities"
          | "campaigns"
          | "templates"
          | "history"
          | "preferences")
      : "dashboard";

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
      initialTab={initialTab}
    />
  );
}

export default function RelationshipPage() {
  return (
    <Suspense fallback={<p className="page-sub">Carregando Central de Relacionamentos…</p>}>
      <RelationshipPageInner />
    </Suspense>
  );
}
