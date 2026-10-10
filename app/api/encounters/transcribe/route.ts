import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { ENCOUNTER_RECORDING_BUCKET } from "@/lib/attendance/recording-types";
import { getTranscriptionProvider } from "@/lib/ai/transcription-provider";

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
      transcriptionId?: string;
      segmentId?: string;
      audioStoragePath?: string;
    };

    const transcriptionId = body.transcriptionId?.trim();
    const audioStoragePath = body.audioStoragePath?.trim();
    if (!transcriptionId || !audioStoragePath) {
      return NextResponse.json({ error: "Parâmetros inválidos." }, { status: 400 });
    }

    await supabase.rpc("encounter_recording_save_transcription_result", {
      p_transcription_id: transcriptionId,
      p_status: "processing",
      p_provider: null,
      p_original_text: null,
      p_error_message: null,
      p_is_simulation: false,
    });

    const { data: file, error: downloadError } = await supabase.storage
      .from(ENCOUNTER_RECORDING_BUCKET)
      .download(audioStoragePath);

    if (downloadError || !file) {
      await supabase.rpc("encounter_recording_save_transcription_result", {
        p_transcription_id: transcriptionId,
        p_status: "failed",
        p_error_message: "Não foi possível ler o áudio para transcrição.",
      });
      return NextResponse.json({ error: "Falha ao ler áudio.", status: "failed" }, { status: 400 });
    }

    const provider = getTranscriptionProvider();
    const bytes = await file.arrayBuffer();
    const result = await provider.transcribe({
      bytes,
      mimeType: file.type || "audio/webm",
      fileName: "encounter-segment.webm",
    });

    const isSimulation = result.provider === "dev-mock";

    if (result.status === "unavailable") {
      const { data } = await supabase.rpc("encounter_recording_save_transcription_result", {
        p_transcription_id: transcriptionId,
        p_status: "unavailable",
        p_provider: result.provider,
        p_error_message: result.error ?? "Transcrição automática indisponível.",
        p_is_simulation: false,
      });
      return NextResponse.json({
        status: "unavailable",
        error: "Transcrição automática indisponível.",
        provider: result.provider,
        transcription: data ?? null,
      });
    }

    if (result.status !== "completed" || !result.text.trim()) {
      await supabase.rpc("encounter_recording_save_transcription_result", {
        p_transcription_id: transcriptionId,
        p_status: "failed",
        p_provider: result.provider,
        p_error_message: result.error ?? "Transcrição falhou.",
        p_is_simulation: isSimulation,
      });
      return NextResponse.json(
        { error: result.error ?? "Transcrição falhou.", status: "failed" },
        { status: 422 },
      );
    }

    const { data, error } = await supabase.rpc("encounter_recording_save_transcription_result", {
      p_transcription_id: transcriptionId,
      p_status: "available",
      p_provider: result.provider,
      p_original_text: result.text,
      p_error_message: null,
      p_is_simulation: isSimulation,
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({
      status: "available",
      text: result.text,
      provider: result.provider,
      isSimulation,
      transcription: data ?? null,
    });
  } catch {
    return NextResponse.json({ error: "Erro interno na transcrição." }, { status: 500 });
  }
}
