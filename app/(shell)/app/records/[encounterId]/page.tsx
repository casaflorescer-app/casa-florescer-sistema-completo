import { EncounterWorkspace } from "@/components/attendance/EncounterWorkspace";

export default function EncounterRecordPage({
  params,
}: {
  params: { encounterId: string };
}) {
  return <EncounterWorkspace encounterId={params.encounterId} />;
}
