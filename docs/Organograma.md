# Organograma

Componentes da hospedagem e quem fala com quem.

- Navegador → Caddy (`deploy/Caddyfile`)
- Caddy → Next.js (`Dockerfile`, serviço `app`)
- Caddy → gateway Supabase, só nos prefixos da API
- Next.js → gateway, pela URL pública `https://API_HOST` (o container resolve o domínio para o host)
- Gateway → Auth (GoTrue), PostgREST, Storage e Realtime
- Auth, PostgREST, Storage e Realtime → Postgres
- Storage → volume de arquivos no diretório pinado do Supabase
- Operador → Studio, só por túnel SSH até `127.0.0.1:8000`
- `deploy/bootstrap-admin.sh` → Admin API do Auth em localhost e, em seguida, Postgres

Fora desse desenho: funções de borda, pooler, analytics e vector.

## C076 — schema no banco, produção ainda no desenho acima

O schema `0000`–`0059` e a C074 estão no BancoFlorescerPP. O navegador de produção continua no Caddy e na API. Quando a conexão for autorizada, o Next abre esse database como `casa_login`, que herda `casa_app`, e deixa de chamar a API antiga. Arquivo clínico fica em volume da VPS, fora da pasta pública, e a rota `/api/casa/files` confere `can_read_exam_file` ou `can_access_patient_photo` antes de ler. A senha de `casa_login` já existe no banco. `CASA_DATABASE_URL`, `CASA_FILES_ROOT` e `NEXT_PUBLIC_CASA_AUTH` não foram ligadas. Esse desenho não substitui o organograma de produção. Na C084, na C085 e na C086, as telas nomeadas, o financeiro, os arquivos, o estoque, a locação, o relacionamento, o portal, a gravação, o compositor de receitas, o catálogo de exames e o painel de resultados passam a ter um segundo caminho, pelo servidor, e ele só entra quando o modo da casa está ligado. O caminho publicado continua o do cliente Supabase. Queixa, anamnese, exame físico, retorno, feedback, gravação, auxílio de IA, contratos, salas, especialidades, políticas e auditoria também usam o servidor quando o modo da casa está ligado. A linha do tempo, o vínculo de gestação na mesma tela, a edição de vínculo de prática e as organizações da plataforma também usam o servidor quando o modo da casa está ligado. A conversão que cria uma gestação nova continua no cliente publicado. A C088 não ligou o modo da casa e não gravou pela aplicação. Em 2026-10-31 o contêiner `casa-hml-web` escutou só em `127.0.0.1:3017` e falou com `casa_hml`. Ele não entrou no Caddy nem no Florescer Web. Foi removido no mesmo dia, com as linhas fictícias e o volume de arquivos. O desenho publicado não mudou.

## Histórico

- 2026-10-31 — C086: contêiner isolado falou com `casa_hml` e foi removido. O Caddy e o Florescer Web não mudaram.
- 2026-10-31 — C088: linha do tempo, vínculo de gestação, vínculo de prática e organizações no segundo caminho. O modo da casa não foi ligado.
- 2026-10-31 — C087.1: atendimento clínico restante, contratos, salas, especialidades, políticas e auditoria no segundo caminho. O modo da casa não foi ligado.
- 2026-10-31 — C087: orientações, busca de item de estoque e documentos do atendimento no segundo caminho. O modo da casa não foi ligado.
- 2026-10-31 — C086: painel de resultados, pedidos de exame, itens de modelo e busca de audiência no segundo caminho. O modo da casa não foi ligado.
- 2026-10-31 — C086: estoque, locação, relacionamento, portal, gravação, compositor de receitas e catálogo de exames no segundo caminho. O modo da casa não foi ligado.
- 2026-10-31 — C085: volume privado e tela de financeiro no segundo caminho. O modo da casa não foi ligado. Estoque, locação e relacionamento seguem no cliente publicado.
- 2026-10-31 — C084: segundo caminho de pacientes, agenda, prontuário, gestação, exames, receitas, repasse e relatórios. O modo da casa não foi ligado.
- 2026-10-31 — `0059` e C074 no BancoFlorescerPP. A senha de `casa_login` existe. A URL da casa continua desligada.
- 2026-10-31 — complemento da C083: a URL da casa e a `0059` continuam sem apply. A aba do Terminal era a do Mac.
- 2026-10-31 — o papel de conexão previsto passou a ser `casa_login`. O schema está no BancoFlorescerPP e a API de produção não mudou.
- 2026-10-31 — organograma da casa no Postgres próprio, sem deploy e sem troca da API.
- 2026-10-21 — organograma da VPS com app, gateway, Auth, API e Storage.
