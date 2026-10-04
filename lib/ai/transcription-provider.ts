/**
 * Abstração de transcrição desacoplada do provedor.
 * Frontend nunca chama IA diretamente.
 *
 * TRANSCRIPTION_AI_ENABLED=false (padrão) → status unavailable (não é falha clínica).
 */

export type TranscriptionProviderStatus =
  | "not_requested"
  | "pending"
  | "processing"
  | "completed"
  | "failed"
  | "skipped"
  | "unavailable";

export type TranscriptionProviderResult = {
  text: string;
  status: TranscriptionProviderStatus;
  error?: string;
  provider: string;
};

export interface TranscriptionProvider {
  readonly name: string;
  isEnabled(): boolean;
  transcribe(input: {
    bytes: ArrayBuffer;
    mimeType: string;
    fileName?: string;
  }): Promise<TranscriptionProviderResult>;
}

export function isTranscriptionAiEnabled(): boolean {
  const flag = process.env.TRANSCRIPTION_AI_ENABLED?.trim().toLowerCase();
  if (flag === "false" || flag === "0" || flag === "off") return false;
  if (flag === "true" || flag === "1" || flag === "on") {
    return Boolean(process.env.OPENAI_API_KEY?.trim());
  }
  // Padrão: só habilita se houver chave real no servidor.
  return Boolean(process.env.OPENAI_API_KEY?.trim());
}

export class UnavailableTranscriptionProvider implements TranscriptionProvider {
  readonly name = "unavailable";
  isEnabled() {
    return false;
  }
  async transcribe(): Promise<TranscriptionProviderResult> {
    return {
      text: "",
      status: "unavailable",
      error: "Transcrição automática ainda não disponível.",
      provider: this.name,
    };
  }
}

export class OpenAITranscriptionProvider implements TranscriptionProvider {
  readonly name = "openai-whisper";
  isEnabled() {
    return Boolean(process.env.OPENAI_API_KEY?.trim());
  }
  async transcribe(input: {
    bytes: ArrayBuffer;
    mimeType: string;
    fileName?: string;
  }): Promise<TranscriptionProviderResult> {
    const apiKey = process.env.OPENAI_API_KEY?.trim();
    if (!apiKey) {
      return {
        text: "",
        status: "unavailable",
        error: "Transcrição automática ainda não disponível.",
        provider: this.name,
      };
    }

    const blob = new Blob([input.bytes], { type: input.mimeType || "audio/webm" });
    const form = new FormData();
    form.append("file", blob, input.fileName || "orientation.webm");
    form.append("model", "whisper-1");
    form.append("language", "pt");

    const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
    });

    if (!response.ok) {
      return {
        text: "",
        status: "failed",
        error: `Falha na transcrição (${response.status}). Você pode digitar a orientação.`,
        provider: this.name,
      };
    }

    const json = (await response.json()) as { text?: string };
    const text = typeof json.text === "string" ? json.text.trim() : "";
    if (!text) {
      return {
        text: "",
        status: "failed",
        error: "Transcrição vazia. Revise o áudio ou digite a orientação.",
        provider: this.name,
      };
    }
    return { text, status: "completed", provider: this.name };
  }
}

/** Provider de desenvolvimento — nunca em produção. Texto fixo, não clínico real. */
export class DevMockTranscriptionProvider implements TranscriptionProvider {
  readonly name = "dev-mock";
  isEnabled() {
    return (
      process.env.NODE_ENV !== "production" &&
      process.env.TRANSCRIPTION_DEV_MOCK === "true"
    );
  }
  async transcribe(): Promise<TranscriptionProviderResult> {
    return {
      text: "[MOCK DEV] Transcrição de teste — não é IA real. Revise antes de publicar.",
      status: "completed",
      provider: this.name,
    };
  }
}

export function getTranscriptionProvider(): TranscriptionProvider {
  const mock = new DevMockTranscriptionProvider();
  if (mock.isEnabled()) return mock;
  if (!isTranscriptionAiEnabled()) return new UnavailableTranscriptionProvider();
  const openai = new OpenAITranscriptionProvider();
  if (openai.isEnabled()) return openai;
  return new UnavailableTranscriptionProvider();
}
