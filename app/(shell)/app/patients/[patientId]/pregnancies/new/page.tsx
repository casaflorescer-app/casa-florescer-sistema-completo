import { PregnancyForm } from "@/components/pregnancies/PregnancyForm";

export default function NewPregnancyPage({ params }: { params: { patientId: string } }) {
  return <PregnancyForm patientId={params.patientId} />;
}
