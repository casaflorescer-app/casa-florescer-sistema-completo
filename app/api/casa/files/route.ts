import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth/session";
import { isCasaDatabaseConfigured, withCasaUser } from "@/lib/db/casa";
import { canReadExamFile, safeRelativePath } from "@/lib/files/casa-volume";
import { acceptCasaUpload, readPrivateFile, removePrivateFile, writePrivateFile } from "@/lib/files/casa-store";
import { patientPhotoThumb } from "@/lib/files/casa-thumb";
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
  if (!UUID.test(id) || (kind !== "photo" && kind !== "exam" && kind !== "document" && kind !== "orientation" && kind !== "recording")) {
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
    if (kind === "orientation") {
      const row = await client.query<{
        audio_storage_path: string | null;
        audio_mime_type: string | null;
        practice_id: string;
        patient_id: string;
        organization_id: string;
      }>(
        `select v.audio_storage_path, v.audio_mime_type, o.practice_id, o.patient_id, o.organization_id
         from public.clinical_orientation_versions v
         join public.clinical_orientations o on o.id = v.orientation_id
         where v.id = $1`,
        [id],
      );
      const file = row.rows[0];
      if (!file?.audio_storage_path) return null;
      return {
        path: file.audio_storage_path,
        type: file.audio_mime_type || "audio/webm",
        practiceId: file.practice_id,
        patientId: file.patient_id,
        organizationId: file.organization_id,
      };
    }
    if (kind === "recording") {
      const row = await client.query<{ audio_storage_path: string | null; audio_mime_type: string | null; encounter_id: string }>(
        "select audio_storage_path, audio_mime_type, encounter_id from public.encounter_recording_segments where id = $1",
        [id],
      );
      const file = row.rows[0];
      if (!file?.audio_storage_path || !safeRelativePath(file.audio_storage_path)) return null;
      try {
        await client.query("select public.encounter_recording_assert_owner($1)", [file.encounter_id]);
      } catch {
        return null;
      }
      return { path: file.audio_storage_path, type: file.audio_mime_type || "audio/webm" };
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
  const thumb = kind === "photo" && url.searchParams.get("variant") === "thumb"
    ? await patientPhotoThumb(bytes)
    : null;
  if (thumb) {
    return new NextResponse(new Uint8Array(thumb), {
      headers: {
        "content-type": "image/webp",
        "content-disposition": "inline",
        "cache-control": "private, max-age=300",
        vary: "cookie",
      },
    });
  }
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
  if (!(file instanceof File) || (kind !== "photo" && kind !== "exam" && kind !== "document" && kind !== "orientation" && kind !== "recording")) {
    return NextResponse.json({ error: "Pedido recusado." }, { status: 400 });
  }
  const type = file.type || (kind === "document" ? "application/pdf" : kind === "orientation" || kind === "recording" ? "audio/webm" : "");
  const acceptKind = kind === "photo" ? "photo" : kind === "orientation" || kind === "recording" ? "audio" : "document";
  if (!acceptCasaUpload({ kind: acceptKind, type, size: file.size })) {
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
  if (kind === "orientation") {
    const organizationId = String(form.get("organizationId") ?? "");
    const patientId = String(form.get("patientId") ?? "");
    const orientationId = String(form.get("orientationId") ?? "");
    const versionId = String(form.get("versionId") ?? "");
    if (!UUID.test(organizationId) || !UUID.test(patientId) || !UUID.test(orientationId) || !UUID.test(versionId)) {
      return NextResponse.json({ error: "Pedido recusado." }, { status: 400 });
    }
    const meta = await withCasaUser(user.userId, async (client) => {
      const result = await client.query<{ practice_id: string }>(
        `select o.practice_id
         from public.clinical_orientations o
         join public.clinical_orientation_versions v on v.orientation_id = o.id
         where o.id = $1 and v.id = $2 and o.organization_id = $3 and o.patient_id = $4`,
        [orientationId, versionId, organizationId, patientId],
      );
      return result.rows[0] ?? null;
    });
    if (!meta) return NextResponse.json({ error: "Pedido recusado." }, { status: 404 });
    const allowed = await canReadExamFile(user.userId, meta.practice_id, patientId, organizationId);
    if (!allowed) return NextResponse.json({ error: "Pedido recusado." }, { status: 403 });
    const relative = `${organizationId}/${patientId}/${orientationId}/${versionId}/audio`;
    if (!safeRelativePath(relative)) return NextResponse.json({ error: "Pedido recusado." }, { status: 400 });
    try {
      await writePrivateFile(relative, bytes);
      const duration = String(form.get("durationSeconds") ?? "");
      await callCasaRpc("clinical_orientation_save_draft", [
        {
          version_id: versionId,
          audio_storage_path: relative,
          audio_mime_type: type.split(";")[0] || "audio/webm",
          audio_duration_seconds: duration ? Number(duration) : null,
        },
      ]);
    } catch {
      await removePrivateFile(relative);
      return NextResponse.json({ error: "Não foi possível guardar o áudio." }, { status: 400 });
    }
    return NextResponse.json({ path: relative });
  }
  if (kind === "recording") {
    const segmentId = String(form.get("segmentId") ?? "");
    if (!UUID.test(segmentId)) return NextResponse.json({ error: "Pedido recusado." }, { status: 400 });
    const meta = await withCasaUser(user.userId, async (client) => {
      const result = await client.query<{ audio_storage_path: string | null; encounter_id: string }>(
        "select audio_storage_path, encounter_id from public.encounter_recording_segments where id = $1",
        [segmentId],
      );
      const fileRow = result.rows[0];
      if (!fileRow?.audio_storage_path || !safeRelativePath(fileRow.audio_storage_path)) return null;
      try {
        await client.query("select public.encounter_recording_assert_owner($1)", [fileRow.encounter_id]);
      } catch {
        return null;
      }
      return fileRow;
    });
    if (!meta?.audio_storage_path) return NextResponse.json({ error: "Pedido recusado." }, { status: 404 });
    try {
      await writePrivateFile(meta.audio_storage_path, bytes);
      const saved = await callCasaRpc("encounter_recording_mark_segment_uploaded", [
        segmentId,
        file.size,
        type.split(";")[0] || "audio/webm",
      ]);
      return NextResponse.json({ path: meta.audio_storage_path, segment: saved });
    } catch {
      await removePrivateFile(meta.audio_storage_path);
      return NextResponse.json({ error: "Não foi possível guardar a gravação." }, { status: 400 });
    }
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
        source: String(form.get("source") ?? "paciente"),
        observation: String(form.get("observation") ?? "") || null,
        document_date: String(form.get("documentDate") ?? "") || null,
        encounter_id: String(form.get("encounterId") ?? "") || null,
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

export async function DELETE(request: Request) {
  const user = await actor();
  if (!user) return unavailable();
  const url = new URL(request.url);
  if (url.searchParams.get("kind") !== "photo") {
    return NextResponse.json({ error: "Pedido recusado." }, { status: 400 });
  }
  const organizationId = url.searchParams.get("organizationId") ?? "";
  const patientId = url.searchParams.get("id") ?? "";
  if (!UUID.test(organizationId) || !UUID.test(patientId)) {
    return NextResponse.json({ error: "Pedido recusado." }, { status: 400 });
  }
  const removed = await withCasaUser(user.userId, async (client) => {
    const allowed = await client.query<{ allowed: boolean }>(
      "select public.can_access_patient_photo($1, $2) as allowed",
      [patientId, organizationId],
    );
    if (allowed.rows[0]?.allowed !== true) return { status: 403 as const, path: null };
    const current = await client.query<{ photo_path: string | null }>(
      "select photo_path from public.patients where id = $1 and organization_id = $2",
      [patientId, organizationId],
    );
    if (!current.rows[0]) return { status: 404 as const, path: null };
    const updated = await client.query(
      "update public.patients set photo_path = null where id = $1 and organization_id = $2",
      [patientId, organizationId],
    );
    if ((updated.rowCount ?? 0) === 0) return { status: 404 as const, path: null };
    return { status: 200 as const, path: current.rows[0].photo_path };
  });
  if (removed.status !== 200) {
    return NextResponse.json(
      { error: removed.status === 403 ? "Pedido recusado." : "Arquivo não encontrado." },
      { status: removed.status },
    );
  }
  if (removed.path && safeRelativePath(removed.path)) await removePrivateFile(removed.path);
  return NextResponse.json({ ok: true });
}
