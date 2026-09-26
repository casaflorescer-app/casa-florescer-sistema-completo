"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  clinicalNoteUpsert,
  encounterSign,
  getEncounter,
  getLatestClinicalNote,
  listClinicalNotes,
  type ClinicalNoteRow,
  type EncounterRow,
} from "@/lib/attendance/directory";
import { listPatients } from "@/lib/patients/directory";
import { listProfessionalLabels } from "@/lib/pregnancies/directory";
import { formatDateTime } from "@/lib/platform/format";
import { StatusMessage } from "@/components/platform/Ui";
import { ClinicalNoteEditor } from "@/components/attendance/ClinicalNoteEditor";
import { EncounterActions } from "@/components/attendance/EncounterActions";
import { EncounterHeader } from "@/components/attendance/EncounterHeader";
import {
  EMPTY_SOAP,
  sameSoap,
  soapFromBody,
  soapHasContent,
  soapToBody,
  type SoapNote,
} from "@/components/attendance/soap";

export function EncounterWorkspace({ encounterId }: { encounterId: string }) {
  const supabase = useMemo(() => createClient(), []);
  const [encounter, setEncounter] = useState<EncounterRow | null>(null);
  const [notes, setNotes] = useState<ClinicalNoteRow[]>([]);
  const [soap, setSoap] = useState<SoapNote>(EMPTY_SOAP);
  const [savedSoap, setSavedSoap] = useState<SoapNote>(EMPTY_SOAP);
  const [patientName, setPatientName] = useState<string | null>(null);
  const [professionalName, setProfessionalName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async (quiet = false) => {
    if (!supabase) {
      setError("Autenticação não configurada neste ambiente.");
      setLoading(false);
      return;
    }
    if (!quiet) setLoading(true);
    const row = await getEncounter(supabase, encounterId);
    if (!row) {
      setEncounter(null);
      setError("Atendimento não encontrado ou sem permissão de leitura.");
      setLoading(false);
      return;
    }
    const [latest, history, patients, professionals] = await Promise.all([
      getLatestClinicalNote(supabase, encounterId),
      listClinicalNotes(supabase, encounterId),
      listPatients(supabase).catch(() => []),
      listProfessionalLabels(supabase, row.practiceId).catch(() => []),
    ]);
    const nextSoap = soapFromBody(latest?.body);
    setEncounter(row);
    setNotes(history);
    setSoap(nextSoap);
    setSavedSoap(nextSoap);
    setPatientName(patients.find((item) => item.id === row.patientId)?.fullName ?? null);
    setProfessionalName(
      professionals.find((item) => item.id === row.professionalId)?.fullName ?? null,
    );
    setError(null);
    setLoading(false);
  }, [encounterId, supabase]);

  useEffect(() => {
    void load();
  }, [load]);

  const locked = encounter != null && encounter.status !== "open";

  async function onSave() {
    if (!supabase || !encounter || locked) return;
    if (!soapHasContent(soap)) {
      setError("Preencha ao menos um campo da evolução.");
      setNotice(null);
      return;
    }
    setBusy(true);
    setError(null);
    setNotice(null);
    const result = await clinicalNoteUpsert(supabase, {
      encounterId: encounter.id,
      body: soapToBody(soap),
      templateCode: "soap_min",
    });
    setBusy(false);
    if (result.error || !result.noteId) {
      setError(result.error ?? "Não foi possível salvar a evolução.");
      return;
    }
    setNotice("Evolução salva.");
    await load(true);
  }

  async function onSign() {
    if (!supabase || !encounter || locked) return;
    if (!sameSoap(soap, savedSoap)) {
      setError("Salve a evolução antes de assinar.");
      setNotice(null);
      return;
    }
    if (!soapHasContent(savedSoap)) {
      setError("Salve a evolução antes de assinar.");
      setNotice(null);
      return;
    }
    if (!window.confirm("Assinar este atendimento? Depois da assinatura a evolução não poderá ser alterada.")) {
      return;
    }
    setBusy(true);
    setError(null);
    setNotice(null);
    const result = await encounterSign(supabase, encounter.id);
    setBusy(false);
    if (result.error || !result.encounterId) {
      setError(result.error ?? "Não foi possível assinar o atendimento.");
      return;
    }
    setNotice("Atendimento assinado.");
    await load(true);
  }

  if (loading) {
    return <p className="text-sm text-lotus-600">Carregando atendimento…</p>;
  }

  if (!encounter) {
    return <StatusMessage error={error ?? "Atendimento não encontrado."} />;
  }

  return (
    <div>
      <EncounterHeader
        encounter={encounter}
        patientName={patientName}
        professionalName={professionalName}
      />
      <div className="mt-4">
        <StatusMessage error={error} notice={notice} />
      </div>
      <ClinicalNoteEditor value={soap} locked={locked} onChange={setSoap} />
      <EncounterActions locked={locked} busy={busy} onSave={() => void onSave()} onSign={() => void onSign()} />
      {notes.length > 0 ? (
        <section className="card mt-4">
          <h2 className="text-base font-semibold text-lotus-900">Histórico da evolução</h2>
          <ul className="mt-3 space-y-2 text-sm text-lotus-700">
            {notes.map((note) => (
              <li key={note.id}>
                Versão {note.version} · {formatDateTime(note.createdAt)}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
