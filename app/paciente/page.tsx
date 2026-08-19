import Link from "next/link";
import { EXAM_STATUS_LABEL } from "@/lib/types/domain";

export default function PacienteHomePage() {
  return (
    <div className="space-y-4">
      <section className="card">
        <p className="text-xs font-semibold uppercase tracking-wide text-lotus-500">
          Próxima consulta
        </p>
        <h1 className="mt-1 text-xl font-semibold">Amanhã, 9h · Dra. Samara</h1>
        <p className="mt-1 text-sm text-lotus-600">Casa Florescer · Sala 1</p>
        <Link href="/paciente/agenda" className="mt-3 inline-block text-sm font-medium text-lotus-700">
          Ver detalhes
        </Link>
      </section>
      <section className="card">
        <p className="text-xs font-semibold uppercase tracking-wide text-lotus-500">
          Exame
        </p>
        <h2 className="mt-1 font-semibold">US obstétrico</h2>
        <p className="mt-1 text-sm text-lotus-700">
          {EXAM_STATUS_LABEL.available}. Pode retirar na recepção — não precisa ligar.
        </p>
      </section>
      <Link
        href="/paciente/anexos"
        className="block rounded-2xl border border-dashed border-lotus-300 bg-white px-4 py-6 text-center text-sm font-medium text-lotus-800"
      >
        Enviar um exame para a médica olhar antes da consulta
      </Link>
    </div>
  );
}
