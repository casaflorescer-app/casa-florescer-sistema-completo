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

O schema `0000`–`0059` e a C074 estão no BancoFlorescerPP. O navegador de produção continua no Caddy e na API. Quando a conexão for autorizada, o Next abre esse database como `casa_login`, que herda `casa_app`, e deixa de chamar a API antiga. Arquivo clínico fica em volume da VPS, fora da pasta pública, e a rota `/api/casa/files` confere `can_read_exam_file` ou `can_access_patient_photo` antes de ler. A senha de `casa_login` já existe no banco. `CASA_DATABASE_URL`, `CASA_FILES_ROOT` e `NEXT_PUBLIC_CASA_AUTH` não foram ligadas. Esse desenho não substitui o organograma de produção. Na C084, na C085 e na C086, as telas nomeadas, o financeiro, os arquivos, o estoque, a locação, o relacionamento, o portal, a gravação, o compositor de receitas e o catálogo de exames passam a ter um segundo caminho, pelo servidor, e ele só entra quando o modo da casa está ligado. O caminho publicado continua o do cliente Supabase. O painel de resultados de exame anexados permanece nesse cliente.

## Histórico

- 2026-10-31 — C086: estoque, locação, relacionamento, portal, gravação, compositor de receitas e catálogo de exames no segundo caminho. O modo da casa não foi ligado.
- 2026-10-31 — C085: volume privado e tela de financeiro no segundo caminho. O modo da casa não foi ligado. Estoque, locação e relacionamento seguem no cliente publicado.
- 2026-10-31 — C084: segundo caminho de pacientes, agenda, prontuário, gestação, exames, receitas, repasse e relatórios. O modo da casa não foi ligado.
- 2026-10-31 — `0059` e C074 no BancoFlorescerPP. A senha de `casa_login` existe. A URL da casa continua desligada.
- 2026-10-31 — complemento da C083: a URL da casa e a `0059` continuam sem apply. A aba do Terminal era a do Mac.
- 2026-10-31 — o papel de conexão previsto passou a ser `casa_login`. O schema está no BancoFlorescerPP e a API de produção não mudou.
- 2026-10-31 — organograma da casa no Postgres próprio, sem deploy e sem troca da API.
- 2026-10-21 — organograma da VPS com app, gateway, Auth, API e Storage.
