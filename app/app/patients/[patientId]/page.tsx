import { PatientDetail } from "@/components/patients/PatientDetail";

export default function PatientDetailPage({ params }: { params: { patientId: string } }) {
  return <PatientDetail patientId={params.patientId} />;
}
