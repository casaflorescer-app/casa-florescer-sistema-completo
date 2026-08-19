import { examQueue } from "@/lib/preview/fixtures";
import { EXAM_STATUS_LABEL } from "@/lib/types/domain";

export default function ExamesPage() {
  return (
    <div>
      <h1 className="page-title">Workflow de exames</h1>
      <p className="page-sub">
        Pendente → disponível → retirado. A paciente vê o mesmo status no
        portal, para não ligar perguntando se já chegou.
      </p>
      <ul className="mt-6 space-y-3">
        {examQueue.map((exam) => (
          <li key={exam.patient + exam.title} className="card flex items-center justify-between gap-3">
            <div>
              <p className="font-semibold">{exam.patient}</p>
              <p className="text-sm text-lotus-600">{exam.title}</p>
            </div>
            <span className="rounded-full bg-lotus-100 px-3 py-1 text-xs font-semibold text-lotus-800">
              {EXAM_STATUS_LABEL[exam.status]}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
