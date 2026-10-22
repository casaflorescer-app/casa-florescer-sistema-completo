# Progresso

## Histórico

- 2026-10-21 — Login em ciclo 307 para `/login` no EasyPanel. Layout raiz passou a `force-dynamic` para o cookie de sessão não derrubar a página estática.
- 2026-10-21 — Preparação da hospedagem self-hosted: imagem standalone, Caddy, Supabase pinado com portas internas, geração de chaves, migrations e bootstrap do primeiro admin. Guia em `docs/Infraestrutura.md`.
- 2026-10-21 — Tentativa de criar o banco na VPS. SSH recusado. Ficou `deploy/up-db.sh` para rodar no servidor. O Postgres de produção ainda não existe.
