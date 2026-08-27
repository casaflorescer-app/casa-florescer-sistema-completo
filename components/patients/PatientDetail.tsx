"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { formatIsoDateBr, formatPhone } from "@/lib/patients/format";
import {
  getPatient,
  getPatientPhotoUrl,
  maskCpf,
  removePatientPhoto,
  uploadPatientPhoto,
  validatePatientPhotoFile,
  type PatientListRow,
} from "@/lib/patients/directory";
import { formatDateTime } from "@/lib/platform/format";
import { StatusMessage, buttonClass, ghostButtonClass } from "@/components/platform/Ui";

export function PatientDetail({
  patientId,
  photoUploadFailed = false,
  updated = false,
}: {
  patientId: string;
  photoUploadFailed?: boolean;
  updated?: boolean;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [row, setRow] = useState<PatientListRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(
    photoUploadFailed
      ? "Cadastro realizado, mas a fotografia não pôde ser salva. Tente novamente nesta tela."
      : updated
        ? "Cadastro atualizado com sucesso."
        : null,
  );
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [photoStatus, setPhotoStatus] = useState<"none" | "loading" | "ready" | "error">("none");
  const [busy, setBusy] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);

  async function loadPatient() {
    const supabase = createClient();
    if (!supabase) {
      setError("Autenticação não configurada neste ambiente.");
      setLoading(false);
      return;
    }

    const data = await getPatient(supabase, patientId);
    if (!data) {
      setRow(null);
      setPhotoUrl(null);
      setPhotoStatus("none");
      setError("Paciente não encontrada ou sem permissão para visualização.");
      return;
    }
    setRow(data);
    setError(null);

    if (!data.photoPath) {
      setPhotoUrl(null);
      setPhotoStatus("none");
      return;
    }

    setPhotoStatus("loading");
    try {
      const url = await getPatientPhotoUrl(supabase, data.photoPath);
      setPhotoUrl(url);
      setPhotoStatus(url ? "ready" : "error");
    } catch (err: unknown) {
      console.error("[patients] photo url failed", err);
      setPhotoUrl(null);
      setPhotoStatus("error");
    }
  }

  useEffect(() => {
    setLoading(true);
    void loadPatient()
      .catch((err: unknown) => {
        setRow(null);
        setError(err instanceof Error ? err.message : "Paciente não encontrada ou sem permissão para visualização.");
      })
      .finally(() => {
        setLoading(false);
      });
  }, [patientId]);

  async function handleReplace(file: File) {
    if (!row || busy) return;
    const validation = await validatePatientPhotoFile(file);
    if (validation) {
      setError(validation);
      return;
    }
    const supabase = createClient();
    if (!supabase) return;
    setBusy(true);
    setError(null);
    try {
      await uploadPatientPhoto(supabase, row.organizationId, row.id, file);
      setNotice("Fotografia atualizada.");
      setConfirmRemove(false);
      await loadPatient();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Não foi possível alterar a fotografia. Tente novamente.");
    } finally {
      setBusy(false);
    }
  }

  async function handleRemove() {
    if (!row || busy) return;
    const supabase = createClient();
    if (!supabase) return;
    setBusy(true);
    setError(null);
    try {
      await removePatientPhoto(supabase, row.organizationId, row.id);
      setNotice("Fotografia removida.");
      setConfirmRemove(false);
      await loadPatient();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Não foi possível alterar a fotografia. Tente novamente.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-lotus-500">
        Clínica
      </p>
      <h1 className="page-title mt-1">{row?.fullName ?? "Paciente"}</h1>
      <p className="page-sub mt-2">Cadastro administrativo. Sem dados clínicos nesta tela.</p>

      <div className="mt-6 flex flex-wrap gap-3">
        <Link href="/app/patients" className={`${ghostButtonClass} inline-flex items-center`}>
          Voltar para pacientes
        </Link>
        {row ? (
          <Link href={`/app/patients/${patientId}/edit`} className={`${buttonClass} inline-flex items-center`}>
            Editar cadastro
          </Link>
        ) : null}
        <Link href="/app/patients/new" className={`${ghostButtonClass} inline-flex items-center`}>
          Nova paciente
        </Link>
      </div>

      <StatusMessage error={error} notice={notice} />

      {loading ? <p className="mt-6 text-sm text-lotus-600">Carregando paciente…</p> : null}

      {!loading && row ? (
        <>
          <section className="card mt-6 max-w-xl" aria-labelledby="patient-photo-title">
            <h2 id="patient-photo-title" className="font-semibold text-lotus-900">
              Fotografia
            </h2>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="sr-only"
              aria-label="Selecionar fotografia"
              disabled={busy}
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                if (file) void handleReplace(file);
              }}
            />
            {photoStatus === "loading" ? (
              <p className="mt-3 text-sm text-lotus-600">Carregando fotografia…</p>
            ) : null}
            {photoStatus === "error" ? (
              <p className="mt-3 text-sm text-rose-800">Não foi possível carregar a fotografia.</p>
            ) : null}
            {photoStatus === "none" ? (
              <p className="mt-3 text-sm text-lotus-600">Sem fotografia.</p>
            ) : null}
            {photoStatus === "ready" && photoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={photoUrl}
                alt={`Fotografia de ${row.fullName}`}
                className="mt-3 h-40 w-40 rounded-2xl object-cover border border-lotus-100"
              />
            ) : null}
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                className={ghostButtonClass}
                disabled={busy}
                onClick={() => fileInputRef.current?.click()}
              >
                {row.photoPath ? "Alterar fotografia" : "Adicionar fotografia"}
              </button>
              {row.photoPath ? (
                confirmRemove ? (
                  <>
                    <button type="button" className={buttonClass} disabled={busy} onClick={() => void handleRemove()}>
                      {busy ? "Removendo…" : "Confirmar remoção"}
                    </button>
                    <button
                      type="button"
                      className={ghostButtonClass}
                      disabled={busy}
                      onClick={() => setConfirmRemove(false)}
                    >
                      Cancelar
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    className={ghostButtonClass}
                    disabled={busy}
                    onClick={() => setConfirmRemove(true)}
                  >
                    Remover fotografia
                  </button>
                )
              ) : null}
            </div>
          </section>

          <section className="card mt-6 max-w-xl">
            <dl className="grid gap-4 text-sm text-lotus-800">
              <div>
                <dt className="text-xs uppercase tracking-wide text-lotus-500">Nome completo</dt>
                <dd className="mt-1 font-medium text-lotus-900">{row.fullName}</dd>
              </div>
              {row.socialName ? (
                <div>
                  <dt className="text-xs uppercase tracking-wide text-lotus-500">Nome social</dt>
                  <dd className="mt-1">{row.socialName}</dd>
                </div>
              ) : null}
              <div>
                <dt className="text-xs uppercase tracking-wide text-lotus-500">CPF</dt>
                <dd className="mt-1">{maskCpf(row.cpf)}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-lotus-500">Data de nascimento</dt>
                <dd className="mt-1">{row.birthDate ? formatIsoDateBr(row.birthDate) : "—"}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-lotus-500">Telefone</dt>
                <dd className="mt-1">{row.phone ? formatPhone(row.phone) : "—"}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-lotus-500">E-mail</dt>
                <dd className="mt-1 break-all">{row.email ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-lotus-500">Data de cadastro</dt>
                <dd className="mt-1">{formatDateTime(row.createdAt)}</dd>
              </div>
            </dl>
          </section>
        </>
      ) : null}
    </div>
  );
}
