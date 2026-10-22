import { PatientEditForm } from "@/components/patients/PatientEditForm";

export default function PatientEditPage({ params }: { params: { patientId: string } }) {
  return <PatientEditForm patientId={params.patientId} />;
}
