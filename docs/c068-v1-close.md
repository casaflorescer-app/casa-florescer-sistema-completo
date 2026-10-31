# C068 — Fechamento V1 para apresentação

Ciclo de UI/UX/homologação. Sem migration, db push ou deploy EasyPanel pelo Cursor.

## Entregas

- Painel gestão/secretária sem dump técnico (`SYSTEM_ADMIN` / práticas)
- PhysicianPanel: mensagem amigável sem vínculo profissional
- Exames: orientação clara (encounter aberto mantido)
- Central: campanhas ocultas na V1; WhatsApp Web honesto
- UAT: `scripts/uat-c068-structural.mjs`

## Fora de escopo

CRUD profissionais, SNCR/ICP, WhatsApp API, Hosped.1d / db push.

## Deploy

```text
commit → push → PARAR → usuário Implantar no EasyPanel
```
