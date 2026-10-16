/**
 * Flags regulatórias / capacidades documentais.
 * Não codificar datas legais como verdade eterna — revisar conforme Anvisa/CFM.
 */

export const CLINICAL_DOCUMENT_FEATURES = {
  /** Validação interna C040.7/C040.8 — não é assinatura digital qualificada. */
  signatureKind: "internal_system" as const,
  qualifiedElectronicSignatureAvailable: false,
  /**
   * Integração SNCR (RCE/RET eletrônicas).
   * Ausente nesta versão — não emitir numeração/QR fictícios.
   */
  sncrIntegrationAvailable: false,
  /**
   * Referência temporal (revisar): transição Anvisa RCE/RET ↔ SNCR
   * mencionada em out/2026 — NÃO usar como hard-block automático sem config.
   */
  sncrTransitionNote:
    "Emissão eletrônica de RCE/RET integrada ao SNCR não está disponível neste sistema. Consulte a regulamentação Anvisa vigente antes de qualquer implementação.",
} as const;
