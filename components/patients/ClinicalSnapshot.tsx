"use client";

import { useEffect, useState } from "react";
import { ageFromBirthDate, formatIsoDateBr, gpaLabel } from "@/lib/patients/format";
import { CARE_SPECIALTY_LABEL } from "@/lib/patients/schema";
import { getSeedPatient, getStoredPatient, type StoredPatient } from "@/lib/patients/store";

export function ClinicalSnapshot({ patientId }: { patientId: string }) {
  const [patient, setPatient] = useState<StoredPatient | null>(() => getSeedPatient(patientId));

  useEffect(() => {
    setPatient(getStoredPatient(patientId));
  }, [patientId]);

  if (!patient) return null;
  const age = ageFromBirthDate(patient.birthDate);
  const isOb = patient.careSpecialties.includes("obstetrics");

  return (
    <aside className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-4">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-rose-800">
        Ficha clínica · GO
      </p>
      <p className="mt-1 text-xl font-semibold text-rose-950">{patient.fullName}</p>
      <p className="mt-1 text-sm text-rose-900">
        {gpaLabel(patient.pregnancies, patient.births, patient.abortions)}
        {age != null ? ` · ${age} anos` : ""}
        {isOb && patient.edd ? ` · DPP ${formatIsoDateBr(patient.edd)}` : ""}
      </p>
      <dl className="mt-3 grid gap-2 text-sm text-rose-950 sm:grid-cols-2">
        <div>
          <dt className="text-xs font-semibold uppercase tracking-wide text-rose-800">Atendimento</dt>
          <dd>{patient.careSpecialties.map((item) => CARE_SPECIALTY_LABEL[item]).join(", ") || "—"}</dd>
        </div>
        <div>
          <dt className="text-xs font-semibold uppercase tracking-wide text-rose-800">DUM</dt>
          <dd>{patient.lmpDate ? formatIsoDateBr(patient.lmpDate) : "—"}</dd>
        </div>
        <div className="sm:col-span-2">
          <dt className="text-xs font-semibold uppercase tracking-wide text-rose-800">Alergias</dt>
          <dd className="font-medium">{patient.allergies?.trim() || "Não informadas"}</dd>
        </div>
        <div>
          <dt className="text-xs font-semibold uppercase tracking-wide text-rose-800">Comorbidades</dt>
          <dd>{patient.comorbidities?.trim() || "—"}</dd>
        </div>
        <div>
          <dt className="text-xs font-semibold uppercase tracking-wide text-rose-800">Medicações contínuas</dt>
          <dd>{patient.continuousMedications?.trim() || "—"}</dd>
        </div>
      </dl>
    </aside>
  );
}
