/**
 * Fachada de transcrição para orientações clínicas.
 * Delega ao TranscriptionProvider (IA desabilitada ≠ falha clínica).
 */

import {
  getTranscriptionProvider,
  type TranscriptionProviderResult,
} from "@/lib/ai/transcription-provider";

export type TranscriptionResult = TranscriptionProviderResult;

export async function transcribeAudioBuffer(input: {
  bytes: ArrayBuffer;
  mimeType: string;
  fileName?: string;
}): Promise<TranscriptionResult> {
  const provider = getTranscriptionProvider();
  return provider.transcribe(input);
}
