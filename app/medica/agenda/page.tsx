import { APPOINTMENT_KIND_LABEL } from "@/lib/types/domain";

const slots = [
  { time: "08:00", patient: "Helena Dias", kind: "consultation" as const },
  { time: "09:00", patient: "Marina Alves", kind: "consultation" as const },
  { time: "10:30", patient: "Procedimento — DIU", kind: "procedure" as const },
  { time: "14:00", patient: "Carla Menezes", kind: "consultation" as const },
];

export default function MedicaAgendaPage() {
  return (
    <div>
      <h1 className="page-title">Agenda inteligente</h1>
      <p className="page-sub">
        Visão separada por consulta e procedimento. Procedimentos ocupam kit e
        sala; consultas ocupam só o tempo da médica.
      </p>
      <div className="mt-6 grid gap-4 md:grid-cols-2">
        {(["consultation", "procedure"] as const).map((kind) => (
          <section key={kind} className="card">
            <h2 className="font-semibold text-lotus-900">
              {APPOINTMENT_KIND_LABEL[kind]}
            </h2>
            <ul className="mt-3 space-y-2">
              {slots
                .filter((slot) => slot.kind === kind)
                .map((slot) => (
                  <li
                    key={slot.time + slot.patient}
                    className="flex justify-between rounded-xl bg-lotus-50 px-3 py-2 text-sm"
                  >
                    <span>{slot.patient}</span>
                    <span className="text-lotus-600">{slot.time}</span>
                  </li>
                ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
