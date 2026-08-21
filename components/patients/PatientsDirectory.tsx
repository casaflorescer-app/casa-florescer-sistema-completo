"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  BILLING_MODALITY_LABEL,
  CARE_SPECIALTY_LABEL,
} from "@/lib/patients/schema";
import { ageFromBirthDate, formatPhone, gpaLabel } from "@/lib/patients/format";
import { SEED_PATIENTS, listStoredPatients, type StoredPatient } from "@/lib/patients/store";

const initialList = [...SEED_PATIENTS].sort((a, b) =>
  a.fullName.localeCompare(b.fullName, "pt-BR"),
);

export function PatientsDirectory() {
  const [query, setQuery] = useState("");
  const [rows, setRows] = useState<StoredPatient[]>(initialList);

  useEffect(() => {
    setRows(listStoredPatients());
  }, []);

  const patients = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((patient) => {
      if (!q) return true;
      return [patient.fullName, patient.cpf, patient.phone, patient.email]
        .join(" ")
        .toLowerCase()
        .includes(q);
    });
  }, [query, rows]);

  return (
    <div>
      <h1 className="page-title">Cadastro de pacientes</h1>
      <p className="page-sub">
        MPI da casa: identidade, contato, faturamento e ficha clínica básica.
        O prontuário de consulta continua isolado por prática.
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Buscar nome, telefone ou CPF"
          className="w-full max-w-md rounded-xl border border-lotus-200 px-3 py-2 text-sm"
        />
        <Link
          href="/secretaria/pacientes/cadastro"
          className="rounded-xl bg-rose-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-rose-600"
        >
          Nova paciente
        </Link>
      </div>
      <ul className="mt-6 space-y-3">
        {patients.map((patient) => {
          const age = ageFromBirthDate(patient.birthDate);
          return (
            <li key={patient.id}>
              <Link
                href={`/secretaria/pacientes/cadastro?id=${patient.id}`}
                className="card block hover:border-rose-200"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-lotus-900">{patient.fullName}</p>
                    <p className="text-sm text-lotus-600">
                      {formatPhone(patient.phone)}
                      {age != null ? ` · ${age} anos` : ""}
                    </p>
                  </div>
                  <p className="rounded-full bg-rose-50 px-3 py-1 text-xs font-semibold text-rose-900">
                    {gpaLabel(patient.pregnancies, patient.births, patient.abortions)}
                  </p>
                </div>
                <p className="mt-2 text-sm text-lotus-800">
                  {patient.careSpecialties.map((item) => CARE_SPECIALTY_LABEL[item]).join(" · ")}
                  {patient.billingModality
                    ? ` · ${BILLING_MODALITY_LABEL[patient.billingModality]}`
                    : ""}
                  {patient.allergies ? ` · Alergias: ${patient.allergies}` : ""}
                </p>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
