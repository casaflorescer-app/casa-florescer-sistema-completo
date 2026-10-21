# AGENTS.md

## Objetivo

Sistema de gestão da clínica Casa Florescer: agenda, prontuário, portal e operação da casa.

## Stack principal

Next.js 14 (App Router, SSR) e Supabase self-hosted (Postgres, Auth, Storage) na VPS de produção.

## Linguagens e frameworks

TypeScript, React 18, Tailwind CSS.

## Banco de dados

PostgreSQL 17, via imagem oficial do Supabase pinada em `deploy/SUPABASE_PIN`. Schema em `supabase/migrations/`.

## Estratégia de autenticação

Supabase Auth (GoTrue). Sessão por cookie no middleware. Cadastro público desligado na VPS. Ver `docs/Auth.md`.

## Convenções de código

TypeScript estrito no build. Rotas de aplicação em `app/`. Acesso a dados em `lib/`.

## Estrutura de diretórios

- `app/`, `components/`, `lib/` — aplicação
- `supabase/migrations/` — schema
- `deploy/` — imagem, Compose, Caddy e scripts da VPS
- `docs/` — governança e o guia de hospedagem

## Comandos úteis

```bash
npm run dev
npm run build
node deploy/generate-keys.mjs --self-test
bash deploy/up.sh
```

## Estratégia de testes

Scripts em `scripts/uat-*.mjs` para os ciclos já existentes. A imagem de produção é o build `standalone`.

## Decisões arquiteturais relevantes

Produção sobe o app e o Supabase na mesma VPS, atrás de Caddy, com HTTPS no domínio. Detalhe em `docs/Arquitetura.md` e `docs/Infraestrutura.md`.

## Restrições conhecidas

- `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_ANON_KEY` entram no build da imagem.
- As migrations não criam clínica nem usuário.
- Domínio real, provedor de e-mail e tamanho da VPS: `a definir` na hora da hospedagem.

## Regras de negócio

Ver `docs/business-rules.md` e os documentos `docs/c*.md` já existentes. `docs/RegrasNegocio.md` da governança ainda não foi consolidado.

## Regras de recuperação de contexto

`docs/RAG.md` ainda não existe. Antes de varrer o código, usar os documentos em `docs/` e as migrations.

## Regras de API

Não há `docs/API.md`. O browser fala com o Supabase; o Next expõe poucas rotas em `app/api/`.

## Regras de frontend

Não há `docs/Frontend.md`. UI em `app/` e `components/`.

## Regras de infraestrutura

`docs/Infraestrutura.md`.

## Fluxo multiagente

Sem fluxo local além da regra global do Cursor.

## Ordem obrigatória de leitura

1. `AGENTS.md`
2. `docs/Infraestrutura.md` (quando a tarefa for hospedagem)
3. `docs/Auth.md`
4. `docs/Arquitetura.md`
5. `supabase/migrations/` quando a tarefa mexer em dados

## Histórico

- 2026-10-21 — criado para a hospedagem self-hosted na VPS.
