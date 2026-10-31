# C066 — Polish V1 (apresentação)

Ciclo de polimento visual/navegação. **Sem** migration, RLS, RPC, infra, commit automático.

## Entregas

- Landing sem marcador `entrada 5`
- Settings placeholder (`/app/admin/settings`, `/app/system/settings`) fora do menu; rotas redirecionam
- Menu Gestão: Salas e locações + Aluguéis e contratos (sem item duplicado de contratos de locação)
- Contratos clínicos preservados em item separado
- Profissionais: aviso explícito de somente leitura
- Central: clareza WhatsApp Web; campanhas como simulação; sem status SENT/DELIVERED/READ
- Docs C063/roadmap: produção oficial `sistema.thvp.cloud` (Vercel = legado)

## Fora de escopo

CRUD profissionais, painel gestão avançado, Hosped.1d, SNCR/ICP, WhatsApp API.

## UAT

`node scripts/uat-c066-structural.mjs`
