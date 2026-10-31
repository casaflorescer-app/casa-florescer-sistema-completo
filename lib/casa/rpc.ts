"use server";

import { getAuthUser } from "@/lib/auth/session";
import { isCasaDatabaseConfigured, withCasaUser } from "@/lib/db/casa";

const ALLOWED: Record<string, number> = {
  appointment_update: 9,
  appointment_set_status: 2,
  appointment_record_arrival: 1,
  appointment_record_actual_end: 1,
  encounter_open_from_appointment: 1,
  encounter_open_return: 2,
  encounter_sign: 1,
  clinical_note_upsert: 3,
  link_encounter_to_pregnancy: 2,
  unlink_encounter_from_pregnancy: 1,
  agenda_block_create: 1,
  agenda_block_update: 1,
  agenda_block_cancel: 2,
  agenda_block_end: 1,
  clinical_exam_request_create: 7,
  clinical_exam_request_confirm: 1,
  exam_order_submit: 1,
  exam_upload_register: 1,
  clinical_document_issue_from_prescription: 4,
  clinical_document_issue_from_exam_request: 5,
  clinical_document_attach_pdf: 3,
};

function assertName(name: string, args: unknown[]) {
  if (!/^[a-z_]+$/.test(name)) throw new Error("Operação recusada.");
  const count = ALLOWED[name];
  if (count == null || args.length !== count) throw new Error("Operação recusada.");
  return name;
}

export async function callCasaRpc(name: string, args: unknown[]): Promise<unknown> {
  const fn = assertName(name, args);
  if (!isCasaDatabaseConfigured()) {
    throw new Error("A sessão da casa ainda não está ligada neste processo.");
  }
  const user = await getAuthUser();
  if (!user) throw new Error("Sem sessão.");
  const placeholders = args.map((_, index) => `$${index + 1}`).join(", ");
  try {
    return await withCasaUser(user.userId, async (client) => {
      const result = await client.query<{ data: unknown }>(
        `select to_jsonb(public.${fn}(${placeholders})) as data`,
        args,
      );
      return result.rows[0]?.data ?? null;
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Não foi possível concluir a operação.";
    throw new Error(message.split("\n")[0] ?? "Não foi possível concluir a operação.");
  }
}
