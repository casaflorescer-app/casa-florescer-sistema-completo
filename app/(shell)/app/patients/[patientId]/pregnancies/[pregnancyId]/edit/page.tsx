import { PregnancyForm } from "@/components/pregnancies/PregnancyForm";

export default function EditPregnancyPage({
  params,
}: {
  params: { patientId: string; pregnancyId: string };
}) {
  return <PregnancyForm patientId={params.patientId} pregnancyId={params.pregnancyId} />;
}
