import { PatientChart } from "@/components/attendance/PatientChart";

/**
 * C040.10 — rota oficial do prontuário centrado na paciente.
 * Pacientes → Abrir Prontuário e Prontuário → pesquisa convergem aqui.
 */
export default function PatientChartPage({
  params,
}: {
  params: { patientId: string };
}) {
  return <PatientChart patientId={params.patientId} />;
}
