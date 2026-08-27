"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth/AuthProvider";
import { createClient } from "@/lib/supabase/client";
import {
  applyBillingModalityChange,
  createPatient,
  emptyPatientForm,
  uploadPatientPhoto,
  validatePatientCreateInput,
  validatePatientPhotoFile,
  type PatientCreateInput,
} from "@/lib/patients/directory";
import { PatientMpiFields } from "@/components/patients/PatientMpiFields";
import { StatusMessage, buttonClass, fieldClass, ghostButtonClass } from "@/components/platform/Ui";

export function PatientCreateForm() {
  const router = useRouter();
  const { authorization, authorizationLoading } = useAuth();
  const [form, setForm] = useState<PatientCreateInput>(emptyPatientForm);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const organizationId = authorization?.profile?.organizationId ?? "";
  const createdBy = authorization?.user.id ?? "";
  const sessionReady = Boolean(organizationId && createdBy);

  useEffect(() => {
    return () => {
      if (photoPreview) URL.revokeObjectURL(photoPreview);
    };
  }, [photoPreview]);

  async function selectPhoto(file: File | null) {
    if (photoPreview) URL.revokeObjectURL(photoPreview);
    if (!file) {
      setPhotoFile(null);
      setPhotoPreview(null);
      return;
    }
    const validation = await validatePatientPhotoFile(file);
    if (validation) {
      setError(validation);
      setPhotoFile(null);
      setPhotoPreview(null);
      return;
    }
    setError(null);
    setPhotoFile(file);
    setPhotoPreview(URL.createObjectURL(file));
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;

    const payload = applyBillingModalityChange(form, form.billingModality);
    const validation = validatePatientCreateInput(payload);
    if (validation) {
      setError(validation);
      return;
    }
    if (!sessionReady) {
      setError("Não foi possível identificar o vínculo da sessão atual.");
      return;
    }

    const supabase = createClient();
    if (!supabase) {
      setError("Autenticação não configurada neste ambiente.");
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const created = await createPatient(supabase, payload, { organizationId, createdBy });
      if (photoFile) {
        try {
          await uploadPatientPhoto(supabase, created.organizationId, created.id, photoFile);
        } catch (photoErr: unknown) {
          console.error("[patients] photo after create failed", photoErr);
          router.replace(`/app/patients/${created.id}?foto=falhou`);
          return;
        }
      }
      router.replace(`/app/patients/${created.id}`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Não foi possível cadastrar a paciente. Tente novamente.");
      setBusy(false);
    }
  }

  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-lotus-500">
        Clínica
      </p>
      <h1 className="page-title mt-1">Nova paciente</h1>
      <p className="page-sub mt-2">Cadastro administrativo. Sem dados clínicos nesta etapa.</p>

      <StatusMessage
        error={
          error ??
          (!authorizationLoading && !sessionReady
            ? "Não foi possível identificar o vínculo da sessão atual."
            : null)
        }
      />

      {authorizationLoading ? (
        <p className="mt-6 text-sm text-lotus-600">Carregando sessão…</p>
      ) : (
        <form
          className="card mt-6 max-w-xl space-y-8"
          onSubmit={(event) => void handleSubmit(event)}
          aria-busy={busy}
        >
          <PatientMpiFields form={form} setForm={setForm} busy={busy} idPrefix="patient" />

          <section className="space-y-4" aria-labelledby="patient-photo-title">
            <h2 id="patient-photo-title" className="font-semibold text-lotus-900">
              Fotografia
            </h2>
            <div>
              <label htmlFor="patient-photo" className="text-sm font-medium text-lotus-800">
                Fotografia
              </label>
              <input
                id="patient-photo"
                type="file"
                className={fieldClass}
                accept="image/jpeg,image/png,image/webp"
                disabled={busy}
                onChange={(event) => {
                  const file = event.target.files?.[0] ?? null;
                  void selectPhoto(file);
                  event.target.value = "";
                }}
              />
              <p className="mt-1 text-xs text-lotus-600">JPG, PNG ou WebP, até 2 MB. Enviada somente após o cadastro.</p>
              {photoPreview ? (
                <div className="mt-3 space-y-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={photoPreview}
                    alt="Pré-visualização da fotografia"
                    className="h-32 w-32 rounded-2xl object-cover border border-lotus-100"
                  />
                  <button
                    type="button"
                    className={ghostButtonClass}
                    disabled={busy}
                    onClick={() => void selectPhoto(null)}
                  >
                    Remover seleção
                  </button>
                </div>
              ) : null}
            </div>
          </section>

          <div className="flex flex-wrap gap-3 pt-2">
            <button type="submit" className={buttonClass} disabled={busy || !sessionReady} aria-disabled={busy || !sessionReady}>
              {busy ? "Salvando…" : "Cadastrar paciente"}
            </button>
            <Link href="/app/patients" className={`${ghostButtonClass} inline-flex items-center`}>
              Cancelar
            </Link>
          </div>
        </form>
      )}
    </div>
  );
}
