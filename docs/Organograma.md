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

O schema está no BancoFlorescerPP. O navegador de produção continua no Caddy e na API. Quando a conexão for autorizada, o Next abre esse database como `casa_login`, que herda `casa_app`. Arquivo clínico fica em volume da VPS e a rota confere `can_read_exam_file` antes de ler. Esse desenho não substitui o organograma de produção.

## Histórico

- 2026-10-31 — o papel de conexão previsto passou a ser `casa_login`. O schema está no BancoFlorescerPP e a API de produção não mudou.
- 2026-10-31 — organograma da casa no Postgres próprio, sem deploy e sem troca da API.
- 2026-10-21 — organograma da VPS com app, gateway, Auth, API e Storage.
