"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ageFromBirthDate, formatIsoDateBr, gpaLabel } from "@/lib/patients/format";
import { SEED_PATIENTS, listStoredPatients, type StoredPatient } from "@/lib/patients/store";

const initialList = [...SEED_PATIENTS].sort((a, b) =>
  a.fullName.localeCompare(b.fullName, "pt-BR"),
);

export function PhysicianPatients() {
  const [rows, setRows] = useState<StoredPatient[]>(initialList);

  useEffect(() => {
    setRows(listStoredPatients());
  }, []);

  return (
    <ul className="mt-6 space-y-3">
      {rows.map((patient) => {
        const age = ageFromBirthDate(patient.birthDate);
        return (
          <li key={patient.id}>
            <Link
              href={`/medica/prontuario/ficha?id=${patient.id}`}
              className="card block hover:border-rose-200"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-semibold text-lotus-900">{patient.fullName}</p>
                  <p className="mt-1 text-sm text-lotus-600">
                    {gpaLabel(patient.pregnancies, patient.births, patient.abortions)}
                    {age != null ? ` · ${age} anos` : ""}
                    {patient.edd ? ` · DPP ${formatIsoDateBr(patient.edd)}` : ""}
                  </p>
                </div>
                {patient.allergies ? (
                  <p className="rounded-full bg-rose-50 px-3 py-1 text-xs font-semibold text-rose-900">
                    Alergias: {patient.allergies}
                  </p>
                ) : null}
              </div>
              {patient.comorbidities ? (
                <p className="mt-2 text-sm text-lotus-800">{patient.comorbidities}</p>
              ) : null}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
