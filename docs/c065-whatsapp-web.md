# C065 — WhatsApp Web (canal operacional)

> Numeração: o Commit 064 foi a modernização UX. Este ciclo é **C065**.

## O que é

O Casa Florescer **abre o WhatsApp Web** (`https://wa.me/...`) com telefone normalizado e mensagem pré-preenchida. O **envio é manual** pelo usuário no WhatsApp.

## O que NÃO é

- WhatsApp Business API / Meta Cloud API
- Webhook, envio automático, SENT / DELIVERED / READ
- Anexo automático de PDF
- URL pública de documento clínico
- Afirmação “mensagem enviada”

## Arquitetura

```
UI (WhatsAppAction / ComposeDialog)
  → normalizePhoneForWhatsApp()
  → buildWhatsAppWebUrl() / openWhatsAppWeb()
  → wa.me?text=...
```

| Arquivo | Função |
|---|---|
| `lib/whatsapp/phone.ts` | Normalização BR (+55), validação |
| `lib/whatsapp/url.ts` | URL wa.me + abertura |
| `lib/whatsapp/messages.ts` | Modelos administrativos |
| `components/whatsapp/WhatsAppAction.tsx` | Botão |
| `components/whatsapp/WhatsAppComposeDialog.tsx` | Prévia editável |

## Módulos

| Módulo | Onde |
|---|---|
| Pacientes | Menu ⋯ + Contato no detalhe |
| Agenda | Menu ⋯ (busca telefone do paciente) |
| Prontuário | Botão administrativo no header |
| Central | Fila “Para contatar” |
| Receitas / Exames | Contato + orientação de anexo manual |

## Segurança / LGPD

- Só aparece em telas já protegidas por PATH_RULES / RBAC / RLS
- Mensagens sem SOAP, diagnóstico, medicamentos ou resultados
- Telefone não é alterado no banco — só normalizado para a URL
- Sem endpoint público novo

## Feedback correto

> “WhatsApp Web foi aberto. Revise a mensagem e clique em enviar no próprio WhatsApp.”

## Migration

Nenhuma.

## UAT

- `scripts/uat-c065-whatsapp-structural.mjs`
- `scripts/uat-c065-whatsapp-security.mjs`
