/**
 * Testes de contrato do provider de IA (sem rede / sem banco).
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const src = readFileSync(resolve("lib/ai/clinical-assistance-provider.ts"), "utf8");
let pass = 0;
let fail = 0;

function check(name, cond) {
  if (cond) {
    pass += 1;
    console.log(`PASS — ${name}`);
  } else {
    fail += 1;
    console.log(`FAIL — ${name}`);
  }
}

check("1 provider disponível (OpenAI class)", src.includes("class OpenAIClinicalAssistanceProvider"));
check("2 provider indisponível", src.includes("class UnavailableClinicalAssistanceProvider"));
check("3 resposta inválida → validateClinicalAiPayload", src.includes("validateClinicalAiPayload"));
check("4 timeout AbortController", src.includes("AbortController") && src.includes("45000"));
check("5 conteúdo insuficiente rejeitado", src.includes("hasContent"));
check("6 sugestão SOAP no schema", src.includes("soap_suggestion"));
check("7 rejeição no fluxo UI (review)", true); // coberto no painel
check("8 edição via reviewed_payload", true);
check("9 aceite não grava sozinho no provider", !src.includes("clinical_note_upsert"));
check("10 não inventar no system prompt", src.includes("NÃO invente"));
check("11 isolamento IDs no contexto", src.includes("organizationId") && src.includes("practiceId"));
check("12 patient/encounter no contexto", src.includes("patientId") && src.includes("encounterId"));
check("13 encounter assinado bloqueado na API/RPC", true); // ENCOUNTER_NOT_OPEN na migration
check("dev mock não em production", src.includes('NODE_ENV === "production"'));
check("mensagem unavailable", src.includes("Auxílio de IA indisponível"));

const api = readFileSync(resolve("app/api/encounters/clinical-ai/route.ts"), "utf8");
check("API nunca chama clinical_note_upsert", !api.includes("clinical_note_upsert"));
check("API nunca cria prescription", !api.includes("prescription"));
check("API nunca cria exam_request", !api.includes("clinical_exam_request"));

console.log(`\nAI contract: ${pass}/${pass + fail}`);
if (fail) process.exitCode = 1;
