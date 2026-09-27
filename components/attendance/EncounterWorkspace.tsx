"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { createClient } from "@/lib/supabase/client";
import { hasStaffRole } from "@/lib/auth/access";
import type { AuthorizationContext } from "@/lib/auth/authorization";
import {
  clinicalNoteUpsert,
  encounterSign,
  getEncounter,
  getEncounterPregnancy,
  linkEncounterToPregnancy,
  listClinicalNotes,
  getLatestClinicalNote,
  unlinkEncounterFromPregnancy,
  type ClinicalNoteRow,
  type EncounterRow,
  type PregnancyContext,
} from "@/lib/attendance/directory";
import { listPatients } from "@/lib/patients/directory";
import { formatIsoDateBr } from "@/lib/patients/format";
import {
  listPatientPregnancies,
  listProfessionalLabels,
  PREGNANCY_RISK_LABEL,
  PREGNANCY_STATUS_LABEL,
  type PregnancyRow,
} from "@/lib/pregnancies/directory";
import { formatDateTime } from "@/lib/platform/format";
import { ghostButtonClass, StatusMessage } from "@/components/platform/Ui";
import { ClinicalNoteEditor } from "@/components/attendance/ClinicalNoteEditor";
import { ContextAssistencial } from "@/components/attendance/ContextAssistencial";
import { EncounterActions } from "@/components/attendance/EncounterActions";
import { EncounterHeader } from "@/components/attendance/EncounterHeader";
import {
  PregnancyLinkDialog,
  type PregnancyLinkChoice,
} from "@/components/attendance/PregnancyLinkDialog";
import {
  EMPTY_SOAP,
  sameSoap,
  soapFromBody,
  soapHasContent,
  soapToBody,
  type SoapNote,
} from "@/components/attendance/soap";

function viewerIsEncounterProfessional(
  authorization: AuthorizationContext | null,
  encounter: EncounterRow,
): boolean {
  if (!authorization || !hasStaffRole(authorization, "physician")) return false;
  return authorization.memberships.some(
    (item) =>
      item.role === "physician" &&
      item.practiceId === encounter.practiceId &&
      item.professional?.id === encounter.professionalId,
  );
}

function choiceDate(value: string | null): string {
  if (!value) return "—";
  const formatted = formatIsoDateBr(value.slice(0, 10));
  return formatted || "—";
}

function toLinkChoice(row: PregnancyRow): PregnancyLinkChoice {
  return {
    id: row.id,
    dum: choiceDate(row.lmpDate),
    dpp: choiceDate(row.clinicalEdd ?? row.calculatedEdd),
    status: PREGNANCY_STATUS_LABEL[row.status],
    risk: row.risk ? PREGNANCY_RISK_LABEL[row.risk] : "—",
    primaryName: row.primaryName ?? "—",
  };
}

export function EncounterWorkspace({ encounterId }: { encounterId: string }) {
  const { authorization } = useAuth();
  const supabase = useMemo(() => createClient(), []);
  const [encounter, setEncounter] = useState<EncounterRow | null>(null);
  const [notes, setNotes] = useState<ClinicalNoteRow[]>([]);
  const [soap, setSoap] = useState<SoapNote>(EMPTY_SOAP);
  const [savedSoap, setSavedSoap] = useState<SoapNote>(EMPTY_SOAP);
  const [patientName, setPatientName] = useState<string | null>(null);
  const [professionalName, setProfessionalName] = useState<string | null>(null);
  const [pregnancy, setPregnancy] = useState<PregnancyContext | null>(null);
  const [pregnancyLinked, setPregnancyLinked] = useState(false);
  const [primaryProfessionalName, setPrimaryProfessionalName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [linkMode, setLinkMode] = useState<"link" | "unlink" | null>(null);
  const [linkChoices, setLinkChoices] = useState<PregnancyLinkChoice[]>([]);
  const [linkLoading, setLinkLoading] = useState(false);
  const [linkBusy, setLinkBusy] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);

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
      setPregnancy(null);
      setPregnancyLinked(false);
      setPrimaryProfessionalName(null);
      setError("Atendimento não encontrado ou sem permissão de leitura.");
      setLoading(false);
      return;
    }
    const [latest, history, patients, professionals, pregnancyContext, linkRow] = await Promise.all([
      getLatestClinicalNote(supabase, encounterId),
      listClinicalNotes(supabase, encounterId),
      listPatients(supabase).catch(() => []),
      listProfessionalLabels(supabase, row.practiceId).catch(() => []),
      getEncounterPregnancy(supabase, encounterId),
      supabase.from("encounters").select("pregnancy_id").eq("id", encounterId).maybeSingle(),
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
    const pregnancyId = linkRow.data?.pregnancy_id;
    setPregnancy(pregnancyContext);
    setPregnancyLinked(
      Boolean(linkRow.error) || (typeof pregnancyId === "string" && pregnancyId.length > 0),
    );
    setPrimaryProfessionalName(
      pregnancyContext
        ? professionals.find((item) => item.id === pregnancyContext.primaryProfessionalId)?.fullName ??
            null
        : null,
    );
    setError(null);
    setLoading(false);
  }, [encounterId, supabase]);

  const refreshPregnancy = useCallback(async () => {
    if (!supabase || !encounter) return;
    const [pregnancyContext, linkRow, professionals] = await Promise.all([
      getEncounterPregnancy(supabase, encounter.id),
      supabase.from("encounters").select("pregnancy_id").eq("id", encounter.id).maybeSingle(),
      listProfessionalLabels(supabase, encounter.practiceId).catch(() => []),
    ]);
    const pregnancyId = linkRow.data?.pregnancy_id;
    setPregnancy(pregnancyContext);
    setPregnancyLinked(
      Boolean(linkRow.error) || (typeof pregnancyId === "string" && pregnancyId.length > 0),
    );
    setPrimaryProfessionalName(
      pregnancyContext
        ? professionals.find((item) => item.id === pregnancyContext.primaryProfessionalId)?.fullName ??
            null
        : null,
    );
  }, [encounter, supabase]);

  useEffect(() => {
    void load();
  }, [load]);

  const locked = encounter != null && encounter.status !== "open";
  const canOfferPregnancyLink =
    encounter != null && encounter.status === "open" && viewerIsEncounterProfessional(authorization, encounter);

  function closeLink() {
    if (linkBusy) return;
    setLinkMode(null);
    setLinkError(null);
    setLinkChoices([]);
    setLinkLoading(false);
  }

  async function openLink() {
    if (!supabase || !encounter || !canOfferPregnancyLink || busy || linkBusy) return;
    setLinkMode("link");
    setLinkError(null);
    setLinkChoices([]);
    setLinkLoading(true);
    try {
      const rows = await listPatientPregnancies(supabase, encounter.patientId);
      const choices = rows
        .filter((row) => row.practiceId === encounter.practiceId)
        .sort((left, right) => {
          if (left.status === "in_care" && right.status !== "in_care") return -1;
          if (right.status === "in_care" && left.status !== "in_care") return 1;
          return 0;
        })
        .map(toLinkChoice);
      setLinkChoices(choices);
    } catch (caught) {
      setLinkError(
        caught instanceof Error ? caught.message : "Não foi possível carregar as gestações.",
      );
    } finally {
      setLinkLoading(false);
    }
  }

  async function onLink(pregnancyId: string) {
    if (!supabase || !encounter || !canOfferPregnancyLink || linkBusy) return;
    setLinkBusy(true);
    setLinkError(null);
    const result = await linkEncounterToPregnancy(supabase, encounter.id, pregnancyId);
    if (result.error || !result.encounterId) {
      setLinkBusy(false);
      setLinkError(result.error ?? "Não foi possível vincular a gestação.");
      return;
    }
    setLinkMode(null);
    setLinkChoices([]);
    setNotice("Gestação vinculada ao atendimento.");
    setError(null);
    await refreshPregnancy();
    setLinkBusy(false);
  }

  async function onUnlink() {
    if (!supabase || !encounter || !canOfferPregnancyLink || linkBusy) return;
    setLinkBusy(true);
    setLinkError(null);
    const result = await unlinkEncounterFromPregnancy(supabase, encounter.id);
    if (result.error || !result.encounterId) {
      setLinkBusy(false);
      setLinkError(result.error ?? "Não foi possível desvincular a gestação.");
      return;
    }
    setLinkMode(null);
    setNotice("Gestação desvinculada do atendimento.");
    setError(null);
    await refreshPregnancy();
    setLinkBusy(false);
  }

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
        assistential={
          <ContextAssistencial
            pregnancy={pregnancy}
            pregnancyLinked={pregnancyLinked}
            encounterAt={encounter.createdAt}
            primaryProfessionalName={primaryProfessionalName}
            actions={
              canOfferPregnancyLink ? (
                pregnancyLinked ? (
                  <button
                    type="button"
                    className={ghostButtonClass}
                    disabled={busy || linkBusy}
                    onClick={() => {
                      setLinkError(null);
                      setLinkMode("unlink");
                    }}
                  >
                    Desvincular gestação
                  </button>
                ) : (
                  <button
                    type="button"
                    className={ghostButtonClass}
                    disabled={busy || linkBusy}
                    onClick={() => void openLink()}
                  >
                    Vincular gestação
                  </button>
                )
              ) : null
            }
          />
        }
      />
      {linkMode ? (
        <PregnancyLinkDialog
          mode={linkMode}
          choices={linkChoices}
          loading={linkLoading}
          busy={linkBusy}
          error={linkError}
          onClose={closeLink}
          onLink={(pregnancyId) => void onLink(pregnancyId)}
          onUnlink={() => void onUnlink()}
        />
      ) : null}
      <div className="mt-4">
        <StatusMessage error={error} notice={notice} />
      </div>
      <ClinicalNoteEditor value={soap} locked={locked} onChange={setSoap} />
      <EncounterActions
        locked={locked}
        busy={busy || linkBusy}
        onSave={() => void onSave()}
        onSign={() => void onSign()}
      />
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
