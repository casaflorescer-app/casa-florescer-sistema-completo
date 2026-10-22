import { PregnancyDetail } from "@/components/pregnancies/PregnancyDetail";

export default function PregnancyDetailPage({
  params,
  searchParams,
}: {
  params: { patientId: string; pregnancyId: string };
  searchParams?: { atualizado?: string };
}) {
  return (
    <PregnancyDetail
      patientId={params.patientId}
      pregnancyId={params.pregnancyId}
      updated={searchParams?.atualizado === "1"}
    />
  );
}
