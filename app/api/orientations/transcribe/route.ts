import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { saveOrientationDraft } from "@/lib/orientations/directory";
import { CLINICAL_ORIENTATION_BUCKET } from "@/lib/orientations/types";
import { transcribeAudioBuffer } from "@/lib/orientations/transcription";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const supabase = await createServerSupabase();
    if (!supabase) {
      return NextResponse.json({ error: "Autenticação indisponível." }, { status: 500 });
    }

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "NOT_AUTHENTICATED" }, { status: 401 });
    }

    const body = (await request.json()) as {
      versionId?: string;
      audioStoragePath?: string;
    };

    const versionId = body.versionId?.trim();
    const audioStoragePath = body.audioStoragePath?.trim();
    if (!versionId || !audioStoragePath || audioStoragePath.includes("..")) {
      return NextResponse.json({ error: "Parâmetros inválidos." }, { status: 400 });
    }

    const { data: version, error: versionError } = await supabase
      .from("clinical_orientation_versions")
      .select("audio_storage_path")
      .eq("id", versionId)
      .maybeSingle();
    const storedPath =
      typeof version?.audio_storage_path === "string" ? version.audio_storage_path : "";
    if (versionError || !storedPath || storedPath !== audioStoragePath) {
      return NextResponse.json(
        { error: "Áudio não corresponde a esta orientação." },
        { status: 403 },
      );
    }

    const started = await saveOrientationDraft(supabase, {
      version_id: versionId,
      transcription_status: "processing",
      transcription_error: null,
    });
    if (started.error) {
      return NextResponse.json({ error: "Transcrição não autorizada." }, { status: 403 });
    }

    const { data: file, error: downloadError } = await supabase.storage
      .from(CLINICAL_ORIENTATION_BUCKET)
      .download(audioStoragePath);

    if (downloadError || !file) {
      await saveOrientationDraft(supabase, {
        version_id: versionId,
        transcription_status: "failed",
        transcription_error: "Não foi possível ler o áudio para transcrição.",
      });
      return NextResponse.json({ error: "Falha ao ler áudio." }, { status: 400 });
    }

    const bytes = await file.arrayBuffer();
    const result = await transcribeAudioBuffer({
      bytes,
      mimeType: file.type || "audio/webm",
      fileName: "orientation.webm",
    });

    if (result.status === "unavailable") {
      const saved = await saveOrientationDraft(supabase, {
        version_id: versionId,
        transcription_status: "unavailable",
        transcription_error: result.error ?? "Transcrição automática ainda não disponível.",
      });
      return NextResponse.json(
        {
          status: "unavailable",
          error: "Transcrição automática ainda não disponível.",
          provider: result.provider,
          version: saved.version,
        },
        { status: 200 },
      );
    }

    if (result.status !== "completed") {
      await saveOrientationDraft(supabase, {
        version_id: versionId,
        transcription_status: "failed",
        transcription_error: result.error ?? "Transcrição falhou.",
      });
      return NextResponse.json(
        { error: result.error ?? "Transcrição falhou.", status: "failed" },
        { status: 422 },
      );
    }

    const saved = await saveOrientationDraft(supabase, {
      version_id: versionId,
      transcription_status: "completed",
      transcription_text: result.text,
      transcription_error: null,
      final_text: result.text,
    });

    if (saved.error || !saved.version) {
      return NextResponse.json({ error: saved.error ?? "Falha ao salvar." }, { status: 400 });
    }

    return NextResponse.json({
      status: "completed",
      text: result.text,
      provider: result.provider,
      version: saved.version,
    });
  } catch {
    return NextResponse.json({ error: "Erro interno na transcrição." }, { status: 500 });
  }
}
