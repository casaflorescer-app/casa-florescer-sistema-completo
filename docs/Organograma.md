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

## Histórico

- 2026-10-21 — organograma da VPS com app, gateway, Auth, API e Storage.
