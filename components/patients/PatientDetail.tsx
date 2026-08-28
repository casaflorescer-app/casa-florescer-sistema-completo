"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { formatCep, formatIsoDateBr, formatPhone } from "@/lib/patients/format";
import {
  BILLING_MODALITY_LABEL,
  CARE_SPECIALTY_LABEL,
  getPatient,
  getPatientPhotoUrl,
  maskCpf,
  PREFERRED_CHANNEL_LABEL,
  PRIVATE_PAYMENT_METHOD_LABEL,
  removePatientPhoto,
  uploadPatientPhoto,
  validatePatientPhotoFile,
  type PatientDetailRow,
} from "@/lib/patients/directory";
import { formatDateTime } from "@/lib/platform/format";
import { StatusMessage, buttonClass, ghostButtonClass } from "@/components/platform/Ui";
import { PatientPregnancies } from "@/components/pregnancies/PatientPregnancies";

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
  const [row, setRow] = useState<PatientDetailRow | null>(null);
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

          <section className="card mt-6 max-w-xl" aria-labelledby="patient-identity-title">
            <h2 id="patient-identity-title" className="font-semibold text-lotus-900">
              Identificação
            </h2>
            <dl className="mt-4 grid gap-4 text-sm text-lotus-800">
              <DetailItem label="Nome completo" value={row.fullName} strong />
              {row.socialName ? <DetailItem label="Nome social" value={row.socialName} /> : null}
              <DetailItem label="CPF" value={maskCpf(row.cpf)} />
              <DetailItem label="Data de nascimento" value={row.birthDate ? formatIsoDateBr(row.birthDate) : "—"} />
              <DetailItem label="Data de cadastro" value={formatDateTime(row.createdAt)} />
            </dl>
          </section>

          <section className="card mt-6 max-w-xl" aria-labelledby="patient-contact-title">
            <h2 id="patient-contact-title" className="font-semibold text-lotus-900">
              Contato
            </h2>
            <dl className="mt-4 grid gap-4 text-sm text-lotus-800">
              <DetailItem label="Telefone" value={row.phone ? formatPhone(row.phone) : "—"} />
              <DetailItem label="E-mail" value={row.email ?? "—"} breakAll />
              <DetailItem label="Canal preferencial" value={PREFERRED_CHANNEL_LABEL[row.preferredChannel]} />
            </dl>
          </section>

          <section className="card mt-6 max-w-xl" aria-labelledby="patient-address-title">
            <h2 id="patient-address-title" className="font-semibold text-lotus-900">
              Endereço
            </h2>
            <dl className="mt-4 grid gap-4 text-sm text-lotus-800">
              <DetailItem label="Logradouro" value={displayText(row.addressStreet)} />
              <DetailItem label="Número" value={displayText(row.addressNumber)} />
              <DetailItem label="Complemento" value={displayText(row.addressComplement)} />
              <DetailItem label="Bairro" value={displayText(row.addressDistrict)} />
              <DetailItem label="Cidade" value={displayText(row.addressCity)} />
              <DetailItem label="UF" value={displayText(row.addressState)} />
              <DetailItem label="CEP" value={row.addressCep ? formatCep(row.addressCep) : "—"} />
            </dl>
          </section>

          <section className="card mt-6 max-w-xl" aria-labelledby="patient-care-title">
            <h2 id="patient-care-title" className="font-semibold text-lotus-900">
              Atendimento
            </h2>
            <dl className="mt-4 grid gap-4 text-sm text-lotus-800">
              <DetailItem
                label="Especialidades"
                value={
                  row.careSpecialties.length > 0
                    ? row.careSpecialties.map((item) => CARE_SPECIALTY_LABEL[item]).join(", ")
                    : "Não informado"
                }
              />
            </dl>
          </section>

          <section className="card mt-6 max-w-xl" aria-labelledby="patient-reception-title">
            <h2 id="patient-reception-title" className="font-semibold text-lotus-900">
              Recepção
            </h2>
            <dl className="mt-4 grid gap-4 text-sm text-lotus-800">
              <DetailItem label="Observações" value={displayText(row.receptionNotes)} />
            </dl>
          </section>

          <section className="card mt-6 max-w-xl" aria-labelledby="patient-billing-title">
            <h2 id="patient-billing-title" className="font-semibold text-lotus-900">
              Faturamento
            </h2>
            <dl className="mt-4 grid gap-4 text-sm text-lotus-800">
              <DetailItem
                label="Modalidade"
                value={row.billingModality ? BILLING_MODALITY_LABEL[row.billingModality] : "Não informado"}
              />
              {row.billingModality === "private" ? (
                <DetailItem
                  label="Forma de pagamento"
                  value={
                    row.privatePaymentMethod
                      ? PRIVATE_PAYMENT_METHOD_LABEL[row.privatePaymentMethod]
                      : "—"
                  }
                />
              ) : null}
              {row.billingModality === "insurance" ? (
                <>
                  <DetailItem label="Convênio" value={displayText(row.insuranceName)} />
                  <DetailItem label="Carteirinha" value={displayText(row.insuranceCardNumber)} />
                  <DetailItem
                    label="Validade"
                    value={row.insuranceValidUntil ? formatIsoDateBr(row.insuranceValidUntil) : "—"}
                  />
                </>
              ) : null}
            </dl>
          </section>

          <PatientPregnancies patientId={patientId} />
        </>
      ) : null}
    </div>
  );
}

function displayText(value: string | null | undefined) {
  const trimmed = value?.trim() ?? "";
  return trimmed.length > 0 ? trimmed : "—";
}

function DetailItem({
  label,
  value,
  strong = false,
  breakAll = false,
}: {
  label: string;
  value: string;
  strong?: boolean;
  breakAll?: boolean;
}) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-lotus-500">{label}</dt>
      <dd
        className={`mt-1 ${strong ? "font-medium text-lotus-900" : ""} ${breakAll ? "break-all" : ""}`}
      >
        {value}
      </dd>
    </div>
  );
}
