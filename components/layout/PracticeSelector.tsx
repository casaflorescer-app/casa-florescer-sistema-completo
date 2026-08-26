"use client";

import { usePracticeUi } from "@/components/layout/PracticeUi";

export function PracticeSelector() {
  const { options, selectedPracticeId, selectPractice } = usePracticeUi();

  if (options.length === 0) {
    return (
      <p className="text-xs text-lotus-600" title="Nenhum vínculo em user_practice_roles">
        Sem prática vinculada
      </p>
    );
  }

  if (options.length === 1) {
    return <p className="text-xs text-lotus-700">{options[0].label}</p>;
  }

  return (
    <label className="flex items-center gap-2 text-xs text-lotus-700">
      <span className="hidden sm:inline">Prática</span>
      <select
        className="max-w-[180px] rounded-lg border border-lotus-100 bg-white px-2 py-1 text-xs text-lotus-900"
        value={selectedPracticeId ?? ""}
        onChange={(event) => selectPractice(event.target.value)}
      >
        {options.map((item) => (
          <option key={item.practiceId} value={item.practiceId}>
            {item.label}
          </option>
        ))}
      </select>
    </label>
  );
}
