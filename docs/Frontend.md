# Frontend

## Login

O formulário em `app/(shell)/login/ui.tsx` continua o mesmo na tela. Com `NEXT_PUBLIC_CASA_AUTH=1` o envio vai para `POST /api/casa/session` e não chama o Auth. Sem essa variável, o envio continua no cliente Supabase. A variável não está ligada na produção atual.

As demais telas ainda leem e gravam pelo cliente do browser enquanto `NEXT_PUBLIC_CASA_AUTH` não está ligado. Cada módulo passa para `lib/db/casa.ts` numa etapa própria, depois que a conexão for autorizada. O schema `0000`–`0059` e a C074 já estão no BancoFlorescerPP. A conexão de produção não foi ligada. Com essa variável em `1`, o browser não abre o cliente Supabase, o login usa a sessão da casa e a casca carrega os papéis por `GET /api/casa/authorization`.

Com `CASA_DATABASE_URL`, a casca da equipe manda para `/login` quando o cookie da casa abre e a linha da sessão não existe mais. Sem essa variável, `/app` continua na casca e não volta sozinho ao login. Sair chama `DELETE /api/casa/session` e, em seguida, o logout do Auth.

Quando `NEXT_PUBLIC_CASA_AUTH` é `1`, a lista e o cadastro de pacientes, a agenda, o prontuário, a lista de gestações, a leitura de exames e de receitas, o repasse da gestação, os relatórios e a lista de usuários chamam o servidor. Nesse modo, a agenda grava status, chegada, fim, bloco e abertura de atendimento; o prontuário grava nota, assinatura e vínculo com a gestação; a gestação cria e atualiza o episódio; o pedido de exame e a emissão de documento chamam as funções já existentes; o rascunho de receita entra pelo servidor. A tela `/app/finance` lista fatura, pagamento, rateio e despesa. O rateio só mostra o valor gravado. A secretária não vê o item de menu. Foto, exame e PDF usam `/api/casa/files`. Estoque, locação, relacionamento, portal, compositor de receitas e catálogo de exames também chamam o servidor. O painel de resultados de exame anexados continua no cliente publicado e fica fora da tela nesse modo. A variável não foi ligada.

## Histórico

- 2026-10-31 — C086: estoque, locação, relacionamento, portal, compositor de receitas e catálogo de exames chamam o servidor com o modo da casa. O modo continua desligado.
- 2026-10-31 — C085: gravações da agenda, do prontuário, da gestação, do pedido e da receita no modo da casa; lista de usuários no servidor; tela `/app/finance`; arquivos em `/api/casa/files`. O modo continua desligado.
- 2026-10-31 — C084: as telas nomeadas chamam o servidor só com o modo da casa ligado. O modo continua desligado. Foto, PDF e emissão de receita ou pedido ficam de fora.
- 2026-10-31 — o banco já tem `0000`–`0059` e a C074. As telas de produção continuam no cliente Supabase. `NEXT_PUBLIC_CASA_AUTH` não foi ligado.
- 2026-10-31 — com o modo da casa ligado, as telas deixam o cliente Supabase. O logout revoga o cookie da casa. O modo não foi ligado.
- 2026-10-31 — a casca da equipe recusa o cookie da casa quando a linha da sessão foi revogada e o banco da casa está configurado.
- 2026-10-31 — o login ganhou o caminho da sessão da casa, desligado por padrão.
