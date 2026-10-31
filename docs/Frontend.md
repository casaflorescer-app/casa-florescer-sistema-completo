# Frontend

## Login

O formulário em `app/(shell)/login/ui.tsx` continua o mesmo na tela. Com `NEXT_PUBLIC_CASA_AUTH=1` o envio vai para `POST /api/casa/session` e não chama o Auth. Sem essa variável, o envio continua no cliente Supabase. A variável não está ligada na produção atual.

As demais telas ainda leem e gravam pelo cliente do browser enquanto `NEXT_PUBLIC_CASA_AUTH` não está ligado. Cada módulo passa para `lib/db/casa.ts` numa etapa própria, depois que a conexão for autorizada. O schema `0000`–`0058` já está no BancoFlorescerPP. A conexão de produção não foi ligada. Com essa variável em `1`, o browser não abre o cliente Supabase, o login usa a sessão da casa e a casca carrega os papéis por `GET /api/casa/authorization`.

Com `CASA_DATABASE_URL`, a casca da equipe manda para `/login` quando o cookie da casa abre e a linha da sessão não existe mais. Sem essa variável, `/app` continua na casca e não volta sozinho ao login. Sair chama `DELETE /api/casa/session` e, em seguida, o logout do Auth.

## Histórico

- 2026-10-31 — com o modo da casa ligado, as telas deixam o cliente Supabase. O logout revoga o cookie da casa. O modo não foi ligado.
- 2026-10-31 — a casca da equipe recusa o cookie da casa quando a linha da sessão foi revogada e o banco da casa está configurado.
- 2026-10-31 — o login ganhou o caminho da sessão da casa, desligado por padrão.
