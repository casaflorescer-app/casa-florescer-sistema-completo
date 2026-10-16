import { createHash } from "node:crypto";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import type { ClinicalDocumentRow } from "@/lib/documents/types";

/** Helvetica WinAnsi — normaliza acentos para PDF padrão (conteúdo completo fica no frozen_payload). */
function pdfSafe(value: unknown): string {
  const text = String(value ?? "");
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x20-\x7E]/g, "?");
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function asArray(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value)
    ? value.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object")
    : [];
}

export async function buildClinicalDocumentPdf(
  doc: ClinicalDocumentRow,
): Promise<{ bytes: Uint8Array; sha256Hex: string }> {
  const payload = doc.frozenPayload;
  const patient = asRecord(payload.patient);
  const professional = asRecord(payload.professional);
  const practice = asRecord(payload.practice);

  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold);
  let page = pdf.addPage([595, 842]);
  let y = 800;
  const margin = 48;
  const line = (text: string, bold = false, size = 11) => {
    if (y < 64) {
      page = pdf.addPage([595, 842]);
      y = 800;
    }
    page.drawText(pdfSafe(text), {
      x: margin,
      y,
      size,
      font: bold ? fontBold : font,
      color: rgb(0.1, 0.1, 0.12),
    });
    y -= size + 6;
  };

  const kindTitle =
    doc.documentKind === "receita"
      ? "RECEITA MEDICA"
      : doc.documentKind === "solicitacao_exames"
        ? "SOLICITACAO DE EXAMES"
        : doc.documentKind === "orientacao"
          ? "ORIENTACAO CLINICA"
          : "DOCUMENTO CLINICO";

  line(kindTitle, true, 16);
  line(pdfSafe(practice.name ?? "Pratica"), false, 10);
  y -= 6;
  line(`Documento: ${doc.id}`, false, 9);
  line(`Versao: ${doc.version}  |  Emitido: ${doc.issuedAt}`, false, 9);
  line(`Integridade (SHA-256 payload): ${doc.contentSha256}`, false, 8);
  y -= 8;

  line("PACIENTE", true, 12);
  line(`Nome: ${patient.full_name ?? "—"}`);
  line(`CPF: ${patient.cpf ?? "nao informado"}`);
  line(`Nascimento: ${patient.birth_date ?? "nao informado"}`);
  y -= 6;

  line("MEDICA / PROFISSIONAL", true, 12);
  line(`Nome: ${professional.full_name ?? "—"}`);
  const council = [professional.council_type, professional.council_number, professional.council_uf]
    .filter(Boolean)
    .join(" ");
  line(`Conselho: ${council || "parcial — completar UF no cadastro"}`);
  line(`RQE: ${professional.rqe_number ?? "nao informado"}`);
  line(`Contato: ${professional.phone ?? "—"} | ${professional.email ?? "—"}`);
  line(`Endereco: ${professional.address ?? "nao informado"}`);
  y -= 6;

  if (doc.documentKind === "receita") {
    const rx = asRecord(payload.prescription);
    line("ITENS DA RECEITA", true, 12);
    for (const item of asArray(rx.items)) {
      line(
        `- ${item.medication_name ?? "Medicamento"} | ${item.presentation ?? ""} | ${item.dosage ?? ""} | ${item.route ?? ""} | ${item.frequency ?? ""} | ${item.duration ?? ""} | qtd ${item.quantity ?? ""}`,
      );
      if (item.instructions) line(`  Obs: ${item.instructions}`, false, 9);
    }
    if (rx.notes) {
      y -= 4;
      line(`Observacoes: ${rx.notes}`);
    }
  }

  if (doc.documentKind === "solicitacao_exames") {
    const req = asRecord(payload.exam_request);
    line("INDICACAO CLINICA", true, 12);
    line(String(req.clinical_indication ?? "nao informada"));
    y -= 4;
    line("EXAMES SOLICITADOS", true, 12);
    for (const item of asArray(req.items)) {
      const groupBit = item.group_name ? ` [grupo: ${item.group_name}]` : "";
      line(`- ${item.name ?? item.custom_name ?? "Exame"}${groupBit}`);
    }
    if (req.notes) {
      y -= 4;
      line(`Observacoes: ${req.notes}`);
    }
  }

  if (doc.documentKind === "orientacao") {
    const ori = asRecord(payload.orientation);
    line("ORIENTACAO PARA A PACIENTE", true, 12);
    line(`Titulo: ${ori.title ?? doc.title}`);
    line(`Modo de entrega (registro): ${ori.delivery_mode ?? "—"}`, false, 9);
    if (ori.published_at) line(`Publicada em: ${ori.published_at}`, false, 9);
    y -= 4;
    const body = String(ori.final_text ?? "");
    for (const paragraph of body.split(/\r?\n/)) {
      const chunk = paragraph.length > 0 ? paragraph : " ";
      // Quebra simples para linhas longas (WinAnsi / Helvetica)
      const max = 90;
      if (chunk.length <= max) {
        line(chunk);
      } else {
        let rest = chunk;
        while (rest.length > 0) {
          line(rest.slice(0, max));
          rest = rest.slice(max);
        }
      }
    }
    if (ori.has_audio) {
      y -= 4;
      line("Nota: esta orientacao tambem possui audio no registro clinico (nao embutido neste PDF).", false, 9);
    }
  }

  y -= 16;
  line("ASSINATURA / VALIDACAO", true, 12);
  line("Tipo: Validacao interna do sistema (internal_system)");
  line("AVISO: Este documento NAO possui assinatura digital qualificada ICP-Brasil.");
  line("Nao constitui certificado digital nem nao-repudio criptografico externo.");
  line(`Validado em: ${doc.signedAt}`);
  line(`Hash do conteudo congelado: ${doc.contentSha256.slice(0, 32)}...`);

  y -= 20;
  page.drawText(pdfSafe(`Pagina gerada pelo Casa Florescer — ID ${doc.id.slice(0, 8)}`), {
    x: margin,
    y: 36,
    size: 8,
    font,
    color: rgb(0.4, 0.4, 0.45),
  });

  const bytes = await pdf.save();
  const sha256Hex = createHash("sha256").update(bytes).digest("hex");
  return { bytes: Uint8Array.from(bytes), sha256Hex };
}
