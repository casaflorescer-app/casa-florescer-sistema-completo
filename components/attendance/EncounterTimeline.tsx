"use client";

import { useEffect, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  ENCOUNTER_STATUS_LABEL,
  getLatestClinicalNote,
  type EncounterRow,
} from "@/lib/attendance/directory";
import { toTimelineItems } from "@/lib/attendance/patient-summary";
import { soapFromBody } from "@/components/attendance/soap";
import { formatDateTime } from "@/lib/platform/format";
import { ghostButtonClass } from "@/components/platform/Ui";

function snippet(text: string, max = 160) {
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean) return "Sem conteúdo textual.";
  return clean.length > max ? `${clean.slice(0, max)}…` : clean;
}

export function EncounterTimeline({
  supabase,
  encounters,
  currentEncounterId,
  loading,
}: {
  supabase: SupabaseClient;
  encounters: EncounterRow[];
  currentEncounterId: string;
  loading?: boolean;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [previewBusy, setPreviewBusy] = useState(false);

  const items = toTimelineItems(encounters);

  useEffect(() => {
    if (!selectedId) {
      setPreview(null);
      return;
    }
    let cancelled = false;
    setPreviewBusy(true);
    void getLatestClinicalNote(supabase, selectedId).then((note) => {
      if (cancelled) return;
      if (!note) {
        setPreview("Sem evolução registrada neste atendimento.");
        setPreviewBusy(false);
        return;
      }
      const soap = soapFromBody(note.body);
      const parts = [
        soap.subjective ? `S: ${soap.subjective}` : null,
        soap.objective ? `O: ${soap.objective}` : null,
        soap.assessment ? `A: ${soap.assessment}` : null,
        soap.plan ? `P: ${soap.plan}` : null,
      ].filter(Boolean);
      setPreview(parts.length ? snippet(parts.join(" · ")) : "Evolução sem campos preenchidos.");
      setPreviewBusy(false);
    });
    return () => {
      cancelled = true;
    };
  }, [selectedId, supabase]);

  return (
    <section id="historico" className="card mt-4 scroll-mt-16 overflow-x-hidden">
      <h2 className="text-base font-semibold text-lotus-900">Histórico clínico</h2>
      <p className="mt-1 text-sm text-lotus-600">
        Linha do tempo desta paciente na prática atual. A visualização abaixo não encerra o
        atendimento em andamento.
      </p>

      {loading ? <p className="mt-3 text-sm text-lotus-600">Carregando histórico…</p> : null}

      {!loading && items.length === 0 ? (
        <p className="mt-3 text-sm text-lotus-600">Nenhum atendimento encontrado nesta prática.</p>
      ) : null}

      {!loading && items.length > 0 ? (
        <ol className="mt-4 space-y-2 border-l-2 border-lotus-200 pl-4">
          {items.map(({ encounter, label }) => {
            const isCurrent = encounter.id === currentEncounterId;
            const isSelected = selectedId === encounter.id;
            return (
              <li key={encounter.id} className="relative">
                <span className="absolute -left-[1.35rem] top-2 h-2.5 w-2.5 rounded-full bg-[#B76E79] ring-2 ring-white" />
                <div
                  className={`rounded-xl border px-3 py-2.5 ${
                    isCurrent
                      ? "border-[#E8B4B8] bg-[#FFF8F5]"
                      : "border-lotus-100 bg-white"
                  }`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-lotus-950">
                        {formatDateTime(encounter.createdAt)} — {label}
                      </p>
                      <p className="mt-0.5 text-xs text-lotus-600">
                        {ENCOUNTER_STATUS_LABEL[encounter.status]}
                        {isCurrent ? " · atendimento atual" : ""}
                      </p>
                    </div>
                    {!isCurrent ? (
                      <button
                        type="button"
                        className={ghostButtonClass}
                        onClick={() =>
                          setSelectedId((current) =>
                            current === encounter.id ? null : encounter.id,
                          )
                        }
                      >
                        {isSelected ? "Fechar" : "Ver registro"}
                      </button>
                    ) : null}
                  </div>
                  {isSelected ? (
                    <div className="mt-2 rounded-lg bg-lotus-50/90 px-3 py-2 text-sm text-lotus-800">
                      {previewBusy ? "Carregando evolução…" : preview}
                      <p className="mt-2 text-xs text-lotus-500">
                        Prévia somente leitura. O atendimento atual permanece aberto nesta tela.
                      </p>
                    </div>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ol>
      ) : null}
    </section>
  );
}
