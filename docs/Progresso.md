# Progresso

## Histórico

- 2026-10-22 — Com "entrada 5" no ar, `/login` respondeu 500 e o navegador mostrou exceção de cliente. A causa é `useAuth()` sem o provider do layout. O hook passou a tratar isso como sessão ausente.
- 2026-10-21 — Com `x-casa-rev: 3` no ar, `/login` continuou em 307 sem `?next=`. O middleware deixou de cobrir `/`, `/login` e `/auth`. A página de login ganhou o texto "entrada 4" para confirmar o próximo deploy.
- 2026-10-21 — O deploy com `force-dynamic` (build `cWgs9-6n4LyMzxeB3Pwda`) continuou em 307 `NEXT_REDIRECT` para `/login`. Rotas públicas passaram a responder sem reescrever o pedido e sem chamar o Auth. Guards ignoram `redirect("/login")` em caminho público. A resposta leva `x-casa-rev: 3`.
- 2026-10-21 — Login em ciclo 307 para `/login` no EasyPanel. Layout raiz passou a `force-dynamic` para o cookie de sessão não derrubar a página estática.
- 2026-10-21 — Preparação da hospedagem self-hosted: imagem standalone, Caddy, Supabase pinado com portas internas, geração de chaves, migrations e bootstrap do primeiro admin. Guia em `docs/Infraestrutura.md`.
- 2026-10-21 — Tentativa de criar o banco na VPS. SSH recusado. Ficou `deploy/up-db.sh` para rodar no servidor. O Postgres de produção ainda não existe.
