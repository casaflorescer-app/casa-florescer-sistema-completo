"use client";

import {
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { AuthorizationMembership } from "@/lib/auth/authorization";

export type PracticeOption = {
  practiceId: string;
  label: string;
};

type PracticeUiValue = {
  options: PracticeOption[];
  selectedPracticeId: string | null;
  selectPractice: (practiceId: string) => void;
};

const PracticeUiContext = createContext<PracticeUiValue | null>(null);

function optionsFromMemberships(
  memberships: AuthorizationMembership[],
): PracticeOption[] {
  const seen = new Set<string>();
  const options: PracticeOption[] = [];
  for (const item of memberships) {
    if (seen.has(item.practiceId)) continue;
    seen.add(item.practiceId);
    options.push({
      practiceId: item.practiceId,
      label: item.practice?.name ?? item.practice?.code ?? "Prática",
    });
  }
  return options;
}

export function PracticeUiProvider({
  memberships,
  children,
}: {
  memberships: AuthorizationMembership[];
  children: ReactNode;
}) {
  const options = useMemo(() => optionsFromMemberships(memberships), [memberships]);
  const [selectedPracticeId, setSelectedPracticeId] = useState<string | null>(
    () => options[0]?.practiceId ?? null,
  );

  const value = useMemo<PracticeUiValue>(() => {
    const valid =
      selectedPracticeId && options.some((item) => item.practiceId === selectedPracticeId)
        ? selectedPracticeId
        : options[0]?.practiceId ?? null;
    return {
      options,
      selectedPracticeId: valid,
      selectPractice: (practiceId: string) => {
        if (options.some((item) => item.practiceId === practiceId)) {
          setSelectedPracticeId(practiceId);
        }
      },
    };
  }, [options, selectedPracticeId]);

  return (
    <PracticeUiContext.Provider value={value}>{children}</PracticeUiContext.Provider>
  );
}

export function usePracticeUi() {
  const ctx = useContext(PracticeUiContext);
  if (!ctx) {
    throw new Error("usePracticeUi() precisa do PracticeUiProvider");
  }
  return ctx;
}
