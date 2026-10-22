import { PatientDetail } from "@/components/patients/PatientDetail";

export default function PatientDetailPage({
  params,
  searchParams,
}: {
  params: { patientId: string };
  searchParams?: { foto?: string; atualizado?: string };
}) {
  return (
    <PatientDetail
      patientId={params.patientId}
      photoUploadFailed={searchParams?.foto === "falhou"}
      updated={searchParams?.atualizado === "1"}
    />
  );
}
