"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm, useWatch, type Path } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  BILLING_MODALITY_LABEL,
  BRAZIL_UFS,
  CARE_SPECIALTY_LABEL,
  PATIENT_FORM_STEPS,
  PAYMENT_METHOD_LABEL,
  emptyPatientCadastro,
  patientCadastroSchema,
  type BillingModality,
  type CareSpecialty,
  type PatientCadastroInput,
  type PatientCadastroValues,
  type PrivatePaymentMethod,
} from "@/lib/patients/schema";
import {
  ageFromBirthDate,
  eddFromLmp,
  formatCep,
  formatCpf,
  formatIsoDateBr,
  formatPhone,
  gpaLabel,
} from "@/lib/patients/format";
import { getStoredPatient, saveStoredPatient, toFormValues } from "@/lib/patients/store";

const inputClass =
  "mt-1.5 w-full rounded-xl border border-lotus-200 bg-white px-3 py-2.5 text-sm text-lotus-900 outline-none transition focus:border-rose-300 focus:ring-2 focus:ring-rose-400";
const labelClass = "block text-sm font-medium text-lotus-800";
const errorClass = "mt-1 text-xs text-rose-700";

type Props = {
  patientId?: string;
  variant?: "staff" | "portal";
};

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className={errorClass}>{message}</p>;
}

function ChoiceChip({
  selected,
  onClick,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-xl border px-3 py-2 text-sm font-medium transition ${
        selected
          ? "border-rose-400 bg-rose-50 text-rose-900"
          : "border-lotus-200 bg-white text-lotus-700 hover:border-rose-200"
      }`}
    >
      {children}
    </button>
  );
}

export function PatientRegistrationForm({ patientId, variant = "staff" }: Props) {
  const router = useRouter();
  const existing = patientId ? getStoredPatient(patientId) : null;
  const [step, setStep] = useState(0);
  const [tagDraft, setTagDraft] = useState("");
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);
  const lastStep = variant === "portal" ? 1 : 2;

  const form = useForm<PatientCadastroInput, unknown, PatientCadastroValues>({
    resolver: zodResolver(patientCadastroSchema),
    defaultValues: existing ? toFormValues(existing) : emptyPatientCadastro(),
    mode: "onTouched",
  });

  const { control, register, setValue, getValues, trigger, handleSubmit, formState, reset } = form;

  useEffect(() => {
    if (!patientId) return;
    const row = getStoredPatient(patientId);
    if (row) reset(toFormValues(row));
  }, [patientId, reset]);
  const birthDate = useWatch({ control, name: "birthDate" });
  const lmpDate = useWatch({ control, name: "lmpDate" });
  const careSpecialties = useWatch({ control, name: "careSpecialties" }) ?? [];
  const billingModality = useWatch({ control, name: "billingModality" });
  const pregnancies = useWatch({ control, name: "pregnancies" }) ?? 0;
  const births = useWatch({ control, name: "births" }) ?? 0;
  const abortions = useWatch({ control, name: "abortions" }) ?? 0;
  const privatePaymentMethod = useWatch({ control, name: "privatePaymentMethod" });
  const allergies = useWatch({ control, name: "allergies" }) ?? "";
  const comorbidities = useWatch({ control, name: "comorbidities" }) ?? "";
  const procedures = useWatch({ control, name: "gynProcedures" }) ?? [];

  const age = useMemo(() => ageFromBirthDate(birthDate || ""), [birthDate]);
  const isObstetrics = careSpecialties.includes("obstetrics");
  const edd = isObstetrics ? eddFromLmp(lmpDate || "") : "";

  async function goNext() {
    const fields = PATIENT_FORM_STEPS[step].fields as readonly Path<PatientCadastroInput>[];
    const ok = await trigger([...fields]);
    if (ok) setStep((current) => Math.min(current + 1, lastStep));
  }

  async function onSubmit(values: PatientCadastroValues) {
    setSaving(true);
    setNotice("");
    try {
      const saved = await saveStoredPatient(values, existing?.id ?? patientId);
      setNotice("Ficha salva.");
      if (variant === "staff") {
        router.push("/secretaria/pacientes");
        router.refresh();
      }
      return saved;
    } finally {
      setSaving(false);
    }
  }

  function toggleSpecialty(value: CareSpecialty) {
    const current = getValues("careSpecialties") ?? [];
    const next = current.includes(value)
      ? current.filter((item) => item !== value)
      : [...current, value];
    setValue("careSpecialties", next, { shouldValidate: true, shouldDirty: true });
  }

  function addProcedure() {
    const label = tagDraft.trim();
    if (!label) return;
    const current = getValues("gynProcedures") ?? [];
    if (!current.includes(label)) {
      setValue("gynProcedures", [...current, label], { shouldDirty: true });
    }
    setTagDraft("");
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
      <ol className="grid grid-cols-3 gap-2">
        {PATIENT_FORM_STEPS.map((item, index) => {
          const active = index === step;
          const done = index < step;
          const locked = variant === "portal" && index === 2;
          return (
            <li key={item.id}>
              <button
                type="button"
                disabled={locked}
                onClick={() => {
                  if (index <= lastStep) setStep(index);
                }}
                className={`w-full rounded-2xl border px-3 py-3 text-left transition ${
                  active
                    ? "border-rose-400 bg-rose-50"
                    : done
                      ? "border-lotus-200 bg-white"
                      : "border-lotus-100 bg-lotus-50/60"
                } ${locked ? "cursor-not-allowed opacity-40" : ""}`}
              >
                <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">
                  Passo {index + 1}
                </span>
                <span className="mt-0.5 block text-sm font-medium text-lotus-900">{item.title}</span>
              </button>
            </li>
          );
        })}
      </ol>

      {step === 0 ? (
        <section className="card space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <label className={`${labelClass} md:col-span-2`}>
              Nome completo
              <input className={inputClass} autoComplete="name" {...register("fullName")} />
              <FieldError message={formState.errors.fullName?.message} />
            </label>
            <label className={labelClass}>
              CPF
              <input
                className={inputClass}
                inputMode="numeric"
                placeholder="000.000.000-00"
                {...register("cpf", {
                  onChange: (event) => {
                    event.target.value = formatCpf(event.target.value);
                  },
                })}
              />
              <FieldError message={formState.errors.cpf?.message} />
            </label>
            <label className={labelClass}>
              Data de nascimento
              <input className={inputClass} type="date" {...register("birthDate")} />
              <FieldError message={formState.errors.birthDate?.message} />
            </label>
            <div className="rounded-xl bg-lotus-50 px-3 py-2.5">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">Idade</p>
              <p className="mt-1 text-lg font-semibold text-lotus-900">
                {age == null ? "—" : `${age} anos`}
              </p>
            </div>
            <label className={labelClass}>
              Telefone / WhatsApp
              <input
                className={inputClass}
                inputMode="tel"
                placeholder="(11) 90000-0000"
                {...register("phone", {
                  onChange: (event) => {
                    event.target.value = formatPhone(event.target.value);
                  },
                })}
              />
              <FieldError message={formState.errors.phone?.message} />
            </label>
            <label className={labelClass}>
              E-mail
              <input className={inputClass} type="email" autoComplete="email" {...register("email")} />
              <FieldError message={formState.errors.email?.message} />
            </label>
          </div>
          <div className="grid gap-4 md:grid-cols-6">
            <label className={`${labelClass} md:col-span-4`}>
              Endereço
              <input className={inputClass} {...register("addressStreet")} />
              <FieldError message={formState.errors.addressStreet?.message} />
            </label>
            <label className={`${labelClass} md:col-span-2`}>
              Número
              <input className={inputClass} {...register("addressNumber")} />
              <FieldError message={formState.errors.addressNumber?.message} />
            </label>
            <label className={`${labelClass} md:col-span-3`}>
              Complemento
              <input className={inputClass} {...register("addressComplement")} />
            </label>
            <label className={`${labelClass} md:col-span-3`}>
              Bairro
              <input className={inputClass} {...register("addressDistrict")} />
              <FieldError message={formState.errors.addressDistrict?.message} />
            </label>
            <label className={`${labelClass} md:col-span-3`}>
              Cidade
              <input className={inputClass} {...register("addressCity")} />
              <FieldError message={formState.errors.addressCity?.message} />
            </label>
            <label className={labelClass}>
              UF
              <select className={inputClass} {...register("addressState")}>
                {BRAZIL_UFS.map((uf) => (
                  <option key={uf} value={uf}>
                    {uf}
                  </option>
                ))}
              </select>
              <FieldError message={formState.errors.addressState?.message} />
            </label>
            <label className={`${labelClass} md:col-span-2`}>
              CEP
              <input
                className={inputClass}
                inputMode="numeric"
                placeholder="00000-000"
                {...register("addressCep", {
                  onChange: (event) => {
                    event.target.value = formatCep(event.target.value);
                  },
                })}
              />
              <FieldError message={formState.errors.addressCep?.message} />
            </label>
          </div>
        </section>
      ) : null}

      {step === 1 ? (
        <section className="card space-y-5">
          <fieldset>
            <legend className="text-sm font-medium text-lotus-800">Tipo de atendimento atual</legend>
            <div className="mt-2 flex flex-wrap gap-2">
              {(Object.keys(CARE_SPECIALTY_LABEL) as CareSpecialty[]).map((item) => (
                <ChoiceChip
                  key={item}
                  selected={careSpecialties.includes(item)}
                  onClick={() => toggleSpecialty(item)}
                >
                  {CARE_SPECIALTY_LABEL[item]}
                </ChoiceChip>
              ))}
            </div>
            <FieldError message={formState.errors.careSpecialties?.message} />
          </fieldset>
          <fieldset>
            <legend className="text-sm font-medium text-lotus-800">Modalidade</legend>
            <div className="mt-2 flex flex-wrap gap-2">
              {(Object.keys(BILLING_MODALITY_LABEL) as BillingModality[]).map((item) => (
                <ChoiceChip
                  key={item}
                  selected={billingModality === item}
                  onClick={() =>
                    setValue("billingModality", item, { shouldValidate: true, shouldDirty: true })
                  }
                >
                  {BILLING_MODALITY_LABEL[item]}
                </ChoiceChip>
              ))}
            </div>
            <FieldError message={formState.errors.billingModality?.message} />
          </fieldset>
          {billingModality === "insurance" ? (
            <div className="grid gap-4 md:grid-cols-3">
              <label className={labelClass}>
                Nome do convênio
                <input className={inputClass} {...register("insuranceName")} />
                <FieldError message={formState.errors.insuranceName?.message} />
              </label>
              <label className={labelClass}>
                Número da carteirinha
                <input className={inputClass} {...register("insuranceCardNumber")} />
                <FieldError message={formState.errors.insuranceCardNumber?.message} />
              </label>
              <label className={labelClass}>
                Validade
                <input className={inputClass} type="date" {...register("insuranceValidUntil")} />
                <FieldError message={formState.errors.insuranceValidUntil?.message} />
              </label>
            </div>
          ) : null}
          {billingModality === "private" ? (
            <fieldset>
              <legend className="text-sm font-medium text-lotus-800">Forma de pagamento preferencial</legend>
              <div className="mt-2 flex flex-wrap gap-2">
                {(Object.keys(PAYMENT_METHOD_LABEL) as PrivatePaymentMethod[]).map((item) => (
                  <ChoiceChip
                    key={item}
                    selected={privatePaymentMethod === item}
                    onClick={() =>
                      setValue("privatePaymentMethod", item, { shouldValidate: true, shouldDirty: true })
                    }
                  >
                    {PAYMENT_METHOD_LABEL[item]}
                  </ChoiceChip>
                ))}
              </div>
              <FieldError message={formState.errors.privatePaymentMethod?.message} />
            </fieldset>
          ) : null}
          {variant === "portal" && isObstetrics ? (
            <div className="grid gap-4 md:grid-cols-2">
              <label className={labelClass}>
                DUM (data da última menstruação)
                <input className={inputClass} type="date" {...register("lmpDate")} />
                <FieldError message={formState.errors.lmpDate?.message} />
              </label>
              <div className="rounded-xl border border-rose-100 bg-rose-50/80 px-3 py-2.5">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-rose-800">DPP calculada</p>
                <p className="mt-1 text-lg font-semibold text-rose-950">
                  {edd ? formatIsoDateBr(edd) : "—"}
                </p>
              </div>
            </div>
          ) : null}
        </section>
      ) : null}

      {step === 2 && variant === "staff" ? (
        <section className="space-y-4">
          <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-rose-800">
              Resumo clínico
            </p>
            <p className="mt-1 text-lg font-semibold text-rose-950">
              {gpaLabel(Number(pregnancies) || 0, Number(births) || 0, Number(abortions) || 0)}
              {age != null ? ` · ${age} anos` : ""}
              {isObstetrics && edd ? ` · DPP ${formatIsoDateBr(edd)}` : ""}
            </p>
            <p className="mt-1 text-sm text-rose-900">
              {allergies?.trim() ? `Alergias: ${allergies}` : "Alergias: não informadas"}
              {comorbidities?.trim() ? ` · Comorbidades: ${comorbidities}` : ""}
            </p>
          </div>
          <div className="card space-y-4">
            <p className="text-sm font-medium text-lotus-800">Fórmulas obstétricas (GPA)</p>
            <div className="grid grid-cols-3 gap-3">
              <label className={labelClass}>
                Gestações (G)
                <input className={inputClass} type="number" min={0} {...register("pregnancies")} />
                <FieldError message={formState.errors.pregnancies?.message} />
              </label>
              <label className={labelClass}>
                Partos (P)
                <input className={inputClass} type="number" min={0} {...register("births")} />
                <FieldError message={formState.errors.births?.message} />
              </label>
              <label className={labelClass}>
                Abortos (A)
                <input className={inputClass} type="number" min={0} {...register("abortions")} />
                <FieldError message={formState.errors.abortions?.message} />
              </label>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <label className={labelClass}>
                DUM (data da última menstruação)
                <input className={inputClass} type="date" {...register("lmpDate")} />
                <FieldError message={formState.errors.lmpDate?.message} />
              </label>
              <div className="rounded-xl border border-rose-100 bg-rose-50/80 px-3 py-2.5">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-rose-800">
                  DPP calculada
                </p>
                <p className="mt-1 text-lg font-semibold text-rose-950">
                  {isObstetrics && edd ? formatIsoDateBr(edd) : "—"}
                </p>
                <p className="mt-1 text-xs text-rose-800">
                  {isObstetrics
                    ? "Naegele: DUM + 280 dias. A médica pode ajustar no pré-natal."
                    : "Preenchida automaticamente na obstetrícia."}
                </p>
              </div>
            </div>
            <label className={labelClass}>
              Procedimentos / cirurgias ginecológicas anteriores
              <div className="mt-1.5 flex gap-2">
                <input
                  className={`${inputClass} mt-0`}
                  value={tagDraft}
                  onChange={(event) => setTagDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      addProcedure();
                    }
                  }}
                  placeholder="Ex.: Cesárea, DIU, miomectomia"
                />
                <button
                  type="button"
                  onClick={addProcedure}
                  className="rounded-xl border border-lotus-200 px-3 text-sm font-medium text-lotus-800"
                >
                  Adicionar
                </button>
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                {procedures.map((item) => (
                  <span
                    key={item}
                    className="inline-flex items-center gap-1 rounded-full bg-lotus-100 px-3 py-1 text-xs font-medium text-lotus-800"
                  >
                    {item}
                    <button
                      type="button"
                      className="text-lotus-500 hover:text-lotus-900"
                      onClick={() =>
                        setValue(
                          "gynProcedures",
                          procedures.filter((tag) => tag !== item),
                          { shouldDirty: true },
                        )
                      }
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            </label>
            <label className={labelClass}>
              Comorbidades
              <textarea className={`${inputClass} min-h-[72px]`} {...register("comorbidities")} />
            </label>
            <label className={labelClass}>
              Medicações de uso contínuo
              <textarea className={`${inputClass} min-h-[72px]`} {...register("continuousMedications")} />
            </label>
            <label className={labelClass}>
              Alergias
              <textarea
                className={`${inputClass} min-h-[72px]`}
                placeholder="Dipirona, látex… ou “Nega alergias”"
                {...register("allergies")}
              />
            </label>
          </div>
        </section>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          disabled={step === 0}
          onClick={() => setStep((current) => Math.max(0, current - 1))}
          className="rounded-xl px-4 py-2.5 text-sm font-medium text-lotus-700 disabled:opacity-40"
        >
          Voltar
        </button>
        <div className="flex items-center gap-3">
          {notice ? <p className="text-sm text-lotus-700">{notice}</p> : null}
          {step < lastStep ? (
            <button
              type="button"
              onClick={goNext}
              className="rounded-xl bg-rose-500 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-rose-600"
            >
              Continuar
            </button>
          ) : (
            <button
              type="submit"
              disabled={saving}
              className="rounded-xl bg-rose-500 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-rose-600 disabled:opacity-60"
            >
              {saving ? "Salvando…" : "Salvar ficha"}
            </button>
          )}
        </div>
      </div>
    </form>
  );
}
