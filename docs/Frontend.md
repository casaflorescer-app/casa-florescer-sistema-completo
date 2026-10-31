# Frontend

## Login

O formulário em `app/(shell)/login/ui.tsx` continua o mesmo na tela. Com `NEXT_PUBLIC_CASA_AUTH=1` o envio vai para `POST /api/casa/session` e não chama o Auth. Sem essa variável, o envio continua no cliente Supabase. A variável não está ligada na produção atual.

As demais telas ainda leem e gravam pelo cliente do browser. Cada módulo passa para `lib/db/casa.ts` numa etapa própria, depois que o schema existir no BancoFlorescerPP e a conexão for autorizada.

## Histórico

- 2026-10-31 — o login ganhou o caminho da sessão da casa, desligado por padrão.
