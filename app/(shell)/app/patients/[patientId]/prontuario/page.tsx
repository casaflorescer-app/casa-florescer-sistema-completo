import { redirect } from "next/navigation";
import { patientChartHref } from "@/lib/patients/directory";

/**
 * C040.10 — alias de convergência: cadastro → mesmo prontuário oficial.
 */
export default function PatientProntuarioAliasPage({
  params,
}: {
  params: { patientId: string };
}) {
  redirect(patientChartHref(params.patientId));
}
