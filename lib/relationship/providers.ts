/**
 * CommunicationProvider — abstração de canais da Central de Relacionamentos.
 *
 * Arquitetura:
 *   Central → CampaignService → MessageService → CommunicationProvider
 *     → StubProvider | WhatsAppProvider | EmailProvider | PushProvider
 *
 * Neste Commit 036: somente StubProvider (SIMULAÇÃO — NÃO ENVIADO).
 * Nenhum provider real está configurado. Não afirmar "enviado".
 */

export type SendPayload = {
  channel: "whatsapp" | "email" | "push";
  to: string;
  body: string;
  subject?: string | null;
  idempotencyKey: string;
  patientId: string;
  campaignId: string;
};

export type SendResult = {
  ok: boolean;
  simulated: boolean;
  provider: string;
  providerMessageId: string | null;
  status: "PENDING" | "SENT" | "FAILED" | "BLOCKED";
  message: string;
};

export interface CommunicationProvider {
  readonly name: string;
  readonly channel: "whatsapp" | "email" | "push";
  isConfigured(): boolean;
  send(payload: SendPayload): Promise<SendResult>;
}

/** Stub explícito para UAT — nunca envia mensagem real. */
export class StubProvider implements CommunicationProvider {
  readonly name = "stub";
  constructor(readonly channel: "whatsapp" | "email" | "push") {}

  isConfigured() {
    return false;
  }

  async send(_payload: SendPayload): Promise<SendResult> {
    return {
      ok: false,
      simulated: true,
      provider: this.name,
      providerMessageId: null,
      status: "PENDING",
      message: "SIMULAÇÃO — NÃO ENVIADO. Canal ainda não configurado.",
    };
  }
}

export class WhatsAppProvider implements CommunicationProvider {
  readonly name = "whatsapp";
  readonly channel = "whatsapp" as const;

  isConfigured() {
    return Boolean(process.env.WHATSAPP_PROVIDER_ENABLED === "true" && process.env.WHATSAPP_API_KEY?.trim());
  }

  async send(payload: SendPayload): Promise<SendResult> {
    if (!this.isConfigured()) {
      return new StubProvider("whatsapp").send(payload);
    }
    // Integração real futura — não implementar neste commit.
    return {
      ok: false,
      simulated: false,
      provider: this.name,
      providerMessageId: null,
      status: "FAILED",
      message: "WhatsAppProvider ainda não implementado.",
    };
  }
}

export class EmailProvider implements CommunicationProvider {
  readonly name = "email";
  readonly channel = "email" as const;

  isConfigured() {
    return Boolean(process.env.EMAIL_PROVIDER_ENABLED === "true" && process.env.EMAIL_API_KEY?.trim());
  }

  async send(payload: SendPayload): Promise<SendResult> {
    if (!this.isConfigured()) {
      return new StubProvider("email").send(payload);
    }
    return {
      ok: false,
      simulated: false,
      provider: this.name,
      providerMessageId: null,
      status: "FAILED",
      message: "EmailProvider ainda não implementado.",
    };
  }
}

export class PushProvider implements CommunicationProvider {
  readonly name = "push";
  readonly channel = "push" as const;

  isConfigured() {
    return Boolean(process.env.WEB_PUSH_ENABLED === "true" && process.env.WEB_PUSH_PUBLIC_KEY?.trim());
  }

  async send(payload: SendPayload): Promise<SendResult> {
    if (!this.isConfigured()) {
      return new StubProvider("push").send(payload);
    }
    return {
      ok: false,
      simulated: false,
      provider: this.name,
      providerMessageId: null,
      status: "FAILED",
      message: "PushProvider ainda não implementado.",
    };
  }
}

export function getCommunicationProvider(
  channel: "whatsapp" | "email" | "push",
): CommunicationProvider {
  if (channel === "whatsapp") {
    const real = new WhatsAppProvider();
    return real.isConfigured() ? real : new StubProvider("whatsapp");
  }
  if (channel === "email") {
    const real = new EmailProvider();
    return real.isConfigured() ? real : new StubProvider("email");
  }
  const real = new PushProvider();
  return real.isConfigured() ? real : new StubProvider("push");
}

export function describeChannelAvailability(channel: "whatsapp" | "email" | "push"): {
  configured: boolean;
  label: string;
} {
  const provider = getCommunicationProvider(channel);
  if (!provider.isConfigured()) {
    return { configured: false, label: "Canal ainda não configurado" };
  }
  return { configured: true, label: "Canal configurado" };
}
