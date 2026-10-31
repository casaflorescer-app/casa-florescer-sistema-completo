import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth/session";
import { isCasaDatabaseConfigured, withCasaUser } from "@/lib/db/casa";
import { canReadExamFile, safeRelativePath } from "@/lib/files/casa-volume";
import { acceptCasaUpload, readPrivateFile, removePrivateFile, writePrivateFile } from "@/lib/files/casa-store";
import { callCasaRpc } from "@/lib/casa/rpc";

export const runtime = "nodejs";

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function unavailable() {
  return NextResponse.json({ error: "Arquivos da casa indisponíveis." }, { status: 503 });
}

async function actor() {
  if (!isCasaDatabaseConfigured() || !process.env.CASA_FILES_ROOT) return null;
  return getAuthUser();
}

export async function GET(request: Request) {
  const user = await actor();
  if (!user) return unavailable();
  const url = new URL(request.url);
  const kind = url.searchParams.get("kind");
  const id = url.searchParams.get("id") ?? "";
  if (!UUID.test(id) || (kind !== "photo" && kind !== "exam" && kind !== "document")) {
    return NextResponse.json({ error: "Pedido recusado." }, { status: 400 });
  }
  const located = await withCasaUser(user.userId, async (client) => {
    if (kind === "photo") {
      const row = await client.query<{ photo_path: string | null; organization_id: string }>(
        "select photo_path, organization_id from public.patients where id = $1",
        [id],
      );
      const photo = row.rows[0];
      if (!photo?.photo_path) return null;
      const allowed = await client.query<{ allowed: boolean }>(
        "select public.can_access_patient_photo($1, $2) as allowed",
        [id, photo.organization_id],
      );
      if (allowed.rows[0]?.allowed !== true) return null;
      return { path: photo.photo_path, type: "image/jpeg" };
    }
    if (kind === "exam") {
      const row = await client.query<{
        storage_path: string;
        mime_type: string | null;
        practice_id: string;
        patient_id: string;
        organization_id: string;
      }>(
        `select u.storage_path, u.mime_type, o.practice_id, o.patient_id, o.organization_id
         from public.exam_uploads u
         join public.exam_orders o on o.id = u.exam_order_id
         where u.id = $1`,
        [id],
      );
      const file = row.rows[0];
      if (!file) return null;
      return {
        path: file.storage_path,
        type: file.mime_type || "application/octet-stream",
        practiceId: file.practice_id,
        patientId: file.patient_id,
        organizationId: file.organization_id,
      };
    }
    const row = await client.query<{
      pdf_storage_path: string | null;
      practice_id: string;
      patient_id: string;
      organization_id: string;
    }>(
      `select pdf_storage_path, practice_id, patient_id, organization_id
       from public.clinical_documents
       where id = $1`,
      [id],
    );
    const file = row.rows[0];
    if (!file?.pdf_storage_path) return null;
    return {
      path: file.pdf_storage_path,
      type: "application/pdf",
      practiceId: file.practice_id,
      patientId: file.patient_id,
      organizationId: file.organization_id,
    };
  });
  if (!located || !safeRelativePath(located.path)) {
    return NextResponse.json({ error: "Arquivo não encontrado." }, { status: 404 });
  }
  if ("practiceId" in located && located.practiceId) {
    const allowed = await canReadExamFile(
      user.userId,
      located.practiceId,
      located.patientId,
      located.organizationId,
    );
    if (!allowed) return NextResponse.json({ error: "Arquivo não encontrado." }, { status: 404 });
  }
  const bytes = await readPrivateFile(located.path);
  if (!bytes) return NextResponse.json({ error: "Arquivo não encontrado." }, { status: 404 });
  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      "content-type": located.type,
      "content-disposition": "attachment",
      "cache-control": "private, no-store",
    },
  });
}

export async function POST(request: Request) {
  const user = await actor();
  if (!user) return unavailable();
  const form = await request.formData();
  const kind = String(form.get("kind") ?? "");
  const file = form.get("file");
  if (!(file instanceof File) || (kind !== "photo" && kind !== "exam" && kind !== "document")) {
    return NextResponse.json({ error: "Pedido recusado." }, { status: 400 });
  }
  const type = file.type || (kind === "document" ? "application/pdf" : "");
  if (!acceptCasaUpload({ kind: kind === "photo" ? "photo" : "document", type, size: file.size })) {
    return NextResponse.json({ error: "Arquivo recusado." }, { status: 400 });
  }
  const bytes = Buffer.from(await file.arrayBuffer());
  if (kind === "photo") {
    const organizationId = String(form.get("organizationId") ?? "");
    const patientId = String(form.get("patientId") ?? "");
    if (!UUID.test(organizationId) || !UUID.test(patientId)) {
      return NextResponse.json({ error: "Pedido recusado." }, { status: 400 });
    }
    const relative = `${organizationId}/${patientId}/photo`;
    const allowed = await withCasaUser(user.userId, async (client) => {
      const result = await client.query<{ allowed: boolean }>(
        "select public.can_access_patient_photo($1, $2) as allowed",
        [patientId, organizationId],
      );
      return result.rows[0]?.allowed === true;
    });
    if (!allowed) return NextResponse.json({ error: "Pedido recusado." }, { status: 403 });
    try {
      await writePrivateFile(relative, bytes);
      await withCasaUser(user.userId, (client) =>
        client.query(
          "update public.patients set photo_path = $1 where id = $2 and organization_id = $3",
          [relative, patientId, organizationId],
        ),
      );
    } catch {
      await removePrivateFile(relative);
      return NextResponse.json({ error: "Não foi possível guardar a fotografia." }, { status: 400 });
    }
    return NextResponse.json({ path: relative });
  }
  if (kind === "document") {
    const documentId = String(form.get("documentId") ?? "");
    if (!UUID.test(documentId)) return NextResponse.json({ error: "Pedido recusado." }, { status: 400 });
    const meta = await withCasaUser(user.userId, async (client) => {
      const result = await client.query<{
        organization_id: string;
        practice_id: string;
        patient_id: string;
      }>(
        "select organization_id, practice_id, patient_id from public.clinical_documents where id = $1",
        [documentId],
      );
      return result.rows[0] ?? null;
    });
    if (!meta) return NextResponse.json({ error: "Pedido recusado." }, { status: 404 });
    const allowed = await canReadExamFile(user.userId, meta.practice_id, meta.patient_id, meta.organization_id);
    if (!allowed) return NextResponse.json({ error: "Pedido recusado." }, { status: 403 });
    const relative = `${meta.organization_id}/${meta.practice_id}/${meta.patient_id}/${documentId}/document.pdf`;
    try {
      const stored = await writePrivateFile(relative, bytes);
      await callCasaRpc("clinical_document_attach_pdf", [documentId, relative, stored.sha256]);
    } catch {
      await removePrivateFile(relative);
      return NextResponse.json({ error: "Não foi possível guardar o documento." }, { status: 400 });
    }
    return NextResponse.json({ path: relative });
  }
  const organizationId = String(form.get("organizationId") ?? "");
  const practiceId = String(form.get("practiceId") ?? "");
  const patientId = String(form.get("patientId") ?? "");
  const title = String(form.get("title") ?? "").trim();
  if (!UUID.test(organizationId) || !UUID.test(practiceId) || !UUID.test(patientId) || !title) {
    return NextResponse.json({ error: "Pedido recusado." }, { status: 400 });
  }
  const allowed = await canReadExamFile(user.userId, practiceId, patientId, organizationId);
  if (!allowed) return NextResponse.json({ error: "Pedido recusado." }, { status: 403 });
  let relative = "";
  try {
    const created = await callCasaRpc("exam_order_submit", [
      {
        organization_id: organizationId,
        practice_id: practiceId,
        patient_id: patientId,
        title,
        source: String(form.get("source") ?? "medico"),
        observation: null,
        document_date: null,
        encounter_id: null,
      },
    ]);
    const payload = created as { order?: { id?: string }; upload_id?: string; storage_path?: string };
    relative = payload.storage_path ?? "";
    if (!safeRelativePath(relative) || !payload.upload_id) {
      return NextResponse.json({ error: "Não foi possível guardar o exame." }, { status: 400 });
    }
    await writePrivateFile(relative, bytes);
    await callCasaRpc("exam_upload_register", [
      {
        exam_order_id: payload.order?.id,
        upload_id: payload.upload_id,
        storage_path: relative,
        original_name: file.name,
        mime_type: type,
        byte_size: file.size,
      },
    ]);
  } catch {
    if (relative) await removePrivateFile(relative);
    return NextResponse.json({ error: "Não foi possível guardar o exame." }, { status: 400 });
  }
  return NextResponse.json({ path: relative });
}
