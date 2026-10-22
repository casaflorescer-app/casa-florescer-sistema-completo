"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/components/auth/AuthProvider";
import { createClient } from "@/lib/supabase/client";
import { hasStaffRole } from "@/lib/auth/access";
import { formatIsoDateBr, formatPhone } from "@/lib/patients/format";
import {
  CARE_SPECIALTIES,
  listPatients,
  maskCpf,
  patientChartHref,
  searchPatients,
  type CareSpecialty,
  type PatientListRow,
} from "@/lib/patients/directory";
import { formatDateTime } from "@/lib/platform/format";
import { StatusMessage, buttonClass, fieldClass, ghostButtonClass } from "@/components/platform/Ui";
import { PatientPhotoThumb } from "@/components/patients/PatientPhotoThumb";
import { PageHeader } from "@/components/ui/PageHeader";
import { RowActions } from "@/components/ui/RowActions";
import { EmptyState } from "@/components/ui/EmptyState";
import type { OverflowItem } from "@/components/ui/OverflowMenu";
import { WhatsAppComposeDialog } from "@/components/whatsapp/WhatsAppComposeDialog";
import { buildAdministrativeHelloMessage } from "@/lib/whatsapp/messages";
import { isValidWhatsAppPhone } from "@/lib/whatsapp/phone";

const FILTER_LABEL: Record<CareSpecialty | "all", string> = {
  all: "Todas",
  gynecology: "Ginecológico",
  obstetrics: "Obstétrico",
};

function PatientRowActions({
  row,
  canOpenChart,
}: {
  row: PatientListRow;
  canOpenChart: boolean;
}) {
  const [waOpen, setWaOpen] = useState(false);
  const secondary: OverflowItem[] = [
    { id: "detail", label: "Ver detalhes", href: `/app/patients/${row.id}` },
  ];
  if (canOpenChart) {
    secondary.push(
      { id: "rx", label: "Receitas", href: `/app/prescriptions?patientId=${row.id}` },
      { id: "exams", label: "Exames", href: `/app/exams?patientId=${row.id}` },
    );
  }
  if (isValidWhatsAppPhone(row.phone)) {
    secondary.push({
      id: "whatsapp",
      label: "WhatsApp",
      onClick: () => setWaOpen(true),
    });
  }

  return (
    <>
      {canOpenChart ? (
        <RowActions
          primary={{
            id: "chart",
            label: "Prontuário",
            href: patientChartHref(row.id),
            variant: "primary",
          }}
          secondary={secondary}
        />
      ) : (
        <RowActions
          primary={{
            id: "detail",
            label: "Detalhes",
            href: `/app/patients/${row.id}`,
            variant: "secondary",
          }}
          secondary={secondary.filter((item) => item.id !== "detail")}
        />
      )}
      <WhatsAppComposeDialog
        open={waOpen}
        onClose={() => setWaOpen(false)}
        recipientName={row.fullName}
        phone={row.phone}
        initialMessage={buildAdministrativeHelloMessage(row.fullName)}
      />
    </>
  );
}

export function PatientList() {
  const { authorization } = useAuth();
  const canOpenChart = authorization ? hasStaffRole(authorization, "physician") : false;
  const [rows, setRows] = useState<PatientListRow[]>([]);
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [specialtyFilter, setSpecialtyFilter] = useState<CareSpecialty | "all">("all");
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const t = window.setTimeout(() => setDebounced(query.trim()), 280);
    return () => window.clearTimeout(t);
  }, [query]);

  useEffect(() => {
    const supabase = createClient();
    if (!supabase) {
      setError("Autenticação não configurada neste ambiente.");
      setLoading(false);
      return;
    }

    void listPatients(supabase)
      .then((data) => {
        setRows(data);
        setError(null);
      })
      .catch((err: unknown) => {
        setRows([]);
        setError(err instanceof Error ? err.message : "Não foi possível carregar as pacientes.");
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  const [filtered, setFiltered] = useState<PatientListRow[]>([]);

  useEffect(() => {
    if (!debounced) {
      setFiltered(rows);
      return;
    }
    if (debounced.length < 2) {
      setFiltered([]);
      return;
    }
    const supabase = createClient();
    if (!supabase) return;
    let cancelled = false;
    setSearching(true);
    void searchPatients(supabase, debounced, { limit: 40 })
      .then((data) => {
        if (!cancelled) setFiltered(data);
      })
      .catch(() => {
        if (!cancelled) setFiltered([]);
      })
      .finally(() => {
        if (!cancelled) setSearching(false);
      });
    return () => {
      cancelled = true;
    };
  }, [debounced, rows]);

  const availableSpecialties = useMemo(() => {
    const present = new Set<CareSpecialty>();
    for (const row of rows) {
      for (const item of row.careSpecialties) present.add(item);
    }
    return CARE_SPECIALTIES.filter((item) => present.has(item));
  }, [rows]);

  const displayRows = useMemo(() => {
    const base = debounced ? filtered : rows;
    if (specialtyFilter === "all") return base;
    return base.filter((row) => row.careSpecialties.includes(specialtyFilter));
  }, [debounced, filtered, rows, specialtyFilter]);

  const chipClass = (active: boolean) =>
    active
      ? `${buttonClass} inline-flex min-h-10 items-center px-3 py-1.5 text-sm`
      : `${ghostButtonClass} inline-flex min-h-10 items-center px-3 py-1.5 text-sm`;

  return (
    <div>
      <PageHeader
        eyebrow="Médico"
        title="Pacientes"
        description="Cadastro e identificação das pacientes"
        actions={
          <Link href="/app/patients/new" className={buttonClass}>
            Nova paciente
          </Link>
        }
      />

      <StatusMessage error={error} />

      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <input
          className={`${fieldClass} mt-0 max-w-md`}
          placeholder="Pesquisar nome, telefone ou CPF"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          aria-label="Pesquisar pacientes"
        />
        <p className="text-sm text-lotus-600">
          {loading || searching
            ? "Carregando…"
            : `${displayRows.length} ${displayRows.length === 1 ? "paciente" : "pacientes"}`}
        </p>
      </div>

      {availableSpecialties.length > 0 ? (
        <div
          className="mt-4 flex flex-wrap gap-2"
          role="group"
          aria-label="Filtrar por classificação assistencial"
        >
          <button
            type="button"
            className={chipClass(specialtyFilter === "all")}
            aria-pressed={specialtyFilter === "all"}
            onClick={() => setSpecialtyFilter("all")}
          >
            {FILTER_LABEL.all}
          </button>
          {availableSpecialties.map((item) => (
            <button
              key={item}
              type="button"
              className={chipClass(specialtyFilter === item)}
              aria-pressed={specialtyFilter === item}
              onClick={() => setSpecialtyFilter(item)}
            >
              {FILTER_LABEL[item]}
            </button>
          ))}
        </div>
      ) : null}

      {loading ? (
        <p className="mt-6 text-sm text-lotus-600">Carregando pacientes…</p>
      ) : null}

      {!loading && !error && displayRows.length === 0 ? (
        <div className="mt-6">
          <EmptyState
            title={
              rows.length === 0
                ? "Não há pacientes cadastrados"
                : "Nenhuma paciente encontrada"
            }
            description={
              rows.length === 0
                ? "Cadastre a primeira paciente para começar o atendimento."
                : "Ajuste a pesquisa ou os filtros e tente novamente."
            }
            action={
              rows.length === 0 ? (
                <Link href="/app/patients/new" className={buttonClass}>
                  Nova paciente
                </Link>
              ) : null
            }
          />
        </div>
      ) : null}

      {!loading && displayRows.length > 0 ? (
        <>
          <ul className="mt-6 space-y-3 md:hidden">
            {displayRows.map((row) => (
              <li key={row.id}>
                <article className="card">
                  <div className="flex gap-3">
                    <div className="pt-0.5">
                      <PatientPhotoThumb photoPath={row.photoPath} patientName={row.fullName} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-lotus-900">{row.fullName}</p>
                      {row.socialName ? (
                        <p className="mt-0.5 text-sm text-lotus-600">{row.socialName}</p>
                      ) : null}
                      <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-sm text-lotus-800">
                        <div>
                          <dt className="text-xs uppercase tracking-wide text-lotus-500">CPF</dt>
                          <dd>{maskCpf(row.cpf)}</dd>
                        </div>
                        <div>
                          <dt className="text-xs uppercase tracking-wide text-lotus-500">Nascimento</dt>
                          <dd>{row.birthDate ? formatIsoDateBr(row.birthDate) : "—"}</dd>
                        </div>
                        <div>
                          <dt className="text-xs uppercase tracking-wide text-lotus-500">Telefone</dt>
                          <dd>{row.phone ? formatPhone(row.phone) : "—"}</dd>
                        </div>
                        <div>
                          <dt className="text-xs uppercase tracking-wide text-lotus-500">Cadastro</dt>
                          <dd>{formatDateTime(row.createdAt)}</dd>
                        </div>
                        <div className="col-span-2">
                          <dt className="text-xs uppercase tracking-wide text-lotus-500">E-mail</dt>
                          <dd className="break-all">{row.email ?? "—"}</dd>
                        </div>
                      </dl>
                      <div className="mt-3">
                        <PatientRowActions row={row} canOpenChart={canOpenChart} />
                      </div>
                    </div>
                  </div>
                </article>
              </li>
            ))}
          </ul>

          <div className="mt-6 hidden min-w-0 max-w-full overflow-x-auto rounded-2xl border border-lotus-100 bg-white md:block">
            <table className="w-full min-w-[56rem] table-fixed text-left text-sm">
              <thead className="border-b border-lotus-100 text-xs uppercase tracking-wide text-lotus-500">
                <tr>
                  <th className="w-14 px-2 py-2.5">Foto</th>
                  <th className="px-2 py-2.5">Paciente</th>
                  <th className="w-[8.5rem] px-2 py-2.5">CPF</th>
                  <th className="w-[7.5rem] px-2 py-2.5">Nascimento</th>
                  <th className="w-[9rem] px-2 py-2.5">Telefone</th>
                  <th className="hidden px-2 py-2.5 xl:table-cell">E-mail</th>
                  <th className="hidden w-[10.5rem] px-2 py-2.5 xl:table-cell">Cadastro</th>
                  <th className="w-[10.5rem] whitespace-nowrap px-2 py-2.5 text-right">Ações</th>
                </tr>
              </thead>
              <tbody>
                {displayRows.map((row) => (
                  <tr key={row.id} className="border-b border-lotus-50 align-middle hover:bg-lotus-50/70">
                    <td className="px-2 py-2">
                      <PatientPhotoThumb photoPath={row.photoPath} patientName={row.fullName} />
                    </td>
                    <td className="min-w-0 px-2 py-2">
                      <Link href={`/app/patients/${row.id}`} className="block min-w-0 hover:text-lotus-700">
                        <p className="truncate font-medium text-lotus-900">{row.fullName}</p>
                        {row.socialName ? (
                          <p className="mt-0.5 truncate text-xs text-lotus-600">{row.socialName}</p>
                        ) : null}
                      </Link>
                    </td>
                    <td className="whitespace-nowrap px-2 py-2">{maskCpf(row.cpf)}</td>
                    <td className="whitespace-nowrap px-2 py-2">
                      {row.birthDate ? formatIsoDateBr(row.birthDate) : "—"}
                    </td>
                    <td className="whitespace-nowrap px-2 py-2">
                      {row.phone ? formatPhone(row.phone) : "—"}
                    </td>
                    <td className="hidden min-w-0 px-2 py-2 xl:table-cell">
                      <span className="block truncate" title={row.email ?? undefined}>
                        {row.email ?? "—"}
                      </span>
                    </td>
                    <td className="hidden whitespace-nowrap px-2 py-2 xl:table-cell">
                      {formatDateTime(row.createdAt)}
                    </td>
                    <td className="whitespace-nowrap px-2 py-2 text-right">
                      <PatientRowActions row={row} canOpenChart={canOpenChart} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : null}
    </div>
  );
}
