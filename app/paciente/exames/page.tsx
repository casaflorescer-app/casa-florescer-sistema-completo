import { EXAM_STATUS_LABEL } from "@/lib/types/domain";

const exams = [
  { title: "US obstétrico", status: "available" as const, hint: "Retire na recepção em horário comercial." },
  { title: "Hemograma", status: "pending" as const, hint: "Ainda no laboratório. Avisaremos aqui." },
];

export default function PacienteExamesPage() {
  return (
    <div className="space-y-3">
      <h1 className="text-lg font-semibold">Seus exames</h1>
      <p className="text-sm text-lotus-600">
        O status muda sozinho. Se estiver “disponível”, é só passar na recepção.
      </p>
      {exams.map((exam) => (
        <article key={exam.title} className="card">
          <p className="font-semibold">{exam.title}</p>
          <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-lotus-600">
            {EXAM_STATUS_LABEL[exam.status]}
          </p>
          <p className="mt-2 text-sm text-lotus-700">{exam.hint}</p>
        </article>
      ))}
    </div>
  );
}
