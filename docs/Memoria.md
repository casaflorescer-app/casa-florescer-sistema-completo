# Memória

## 2026-10-21 — Hospedagem self-hosted

- O diretório oficial `supabase/docker` no commit `9b4a47c6dc6a82cec945fc38d59477970cbe8afa` usa Envoy (`api-gw`) com alias de rede `kong`. O Studio não tem porta 54323; ele fica atrás do gateway.
- `docker compose` 2.24+ é obrigatório por causa de `!override` em `deploy/supabase/override.yml`. Sem isso o merge de portas soma em vez de substituir, e a API ou o Postgres podem ficar em `0.0.0.0`.
- `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_ANON_KEY` são gravadas no `npm run build`. Trocar domínio ou chave exige `bash deploy/up.sh` de novo (ele reconstrói a imagem).
- As chaves JWT de demonstração do Supabase (emissor `supabase-demo`, JSON do payload com espaços) não servem com um `JWT_SECRET` novo. `deploy/up.sh` aborta se encontrá-las.
- Depois das migrations o banco não tem organização nem usuário. O login só passa a ter clínica depois de `deploy/bootstrap-admin.sh`.
- O build da imagem avisa que `next@14.2.15` tem atualização de segurança publicada (aviso do npm em dezembro de 2025). A versão do Next não foi trocada nesta preparação.

## Histórico

- 2026-10-21 — registros da preparação da VPS.
