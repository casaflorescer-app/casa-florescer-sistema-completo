import { withCasaUser } from "@/lib/db/casa";

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function casaFilesRoot() {
  const root = process.env.CASA_FILES_ROOT;
  if (!root) throw new Error("CASA_FILES_ROOT ausente.");
  return root;
}

export function safeRelativePath(value: string) {
  if (!value || value.includes("\0") || value.split(/[\\/]/).includes("..")) {
    return null;
  }
  if (value.startsWith("/") || /^[a-zA-Z]:/.test(value)) return null;
  return value;
}

export async function canReadExamFile(
  userId: string,
  practiceId: string,
  patientId: string,
  organizationId: string,
) {
  if (![practiceId, patientId, organizationId].every((value) => UUID.test(value))) {
    return false;
  }
  return withCasaUser(userId, async (client) => {
    const result = await client.query<{ allowed: boolean }>(
      "select public.can_read_exam_file($1, $2, $3) as allowed",
      [practiceId, patientId, organizationId],
    );
    return result.rows[0]?.allowed === true;
  });
}
