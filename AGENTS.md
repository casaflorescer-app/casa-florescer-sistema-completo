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
- Domínios de produção (Hosped.1): `sistema.thvp.cloud` (app), `api.thvp.cloud` (Auth/REST/Storage).
- Orquestração observada: EasyPanel projeto `cap-romao` — `florescerweb`, `florescerapi` (Compose), `bancoflorescer` (PostgreSQL candidato). Proxy: Traefik EasyPanel (doc) + Caddy + Envoy (headers). Domínio API histórico: serviço Compose `porta-api`:80.
- Paridade migrations `0001–0055` no Postgres (`bancoflorescer` candidato): confirmar em cada ciclo (`docs/system-state.md`). Sem acesso SQL = BLOCKED.
- Co-hospedados no mesmo EasyPanel (n8n, Chatwoot, Evolution): não assumir integração com o app sem prova no código/rede.
- Vercel / GitHub Pages: legado ou paralelo — não são o domínio oficial da clínica.
- GESTÃO ≠ ACESSO CLÍNICO: papel `admin`/`owner` não implica prontuário; clínica exige `physician` + RLS/RPC.
- Não aplicar `scripts/grant-dev-full-access-admin-gestao.sql` sem autorização (concede physician = god-mode clínico).

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
2. `docs/system-state.md` (fotografia atual)
3. `docs/Infraestrutura.md` (quando a tarefa for hospedagem)
4. `docs/Auth.md`
5. `docs/Arquitetura.md`
6. `docs/infrastructure-history.md` (contexto Vercel → VPS)
7. `supabase/migrations/` quando a tarefa mexer em dados

## Diretriz de agilidade

Vale em todas as implementações, salvo instrução expressa em contrário ou risco técnico concreto. O objetivo é concluir a Casa Florescer e deixar a versão definitiva pronta para produção, preservando os dados reais e a segurança clínica. Deploy só com autorização expressa.

### Banco de dados

- Não criar cópia isolada do banco automaticamente.
- Utilizar o BancoFlorescerPP.
- Reaproveitar homologações anteriores.
- Ambiente isolado só com necessidade técnica comprovada, em especial operação destrutiva.
- Nunca executar teste destrutivo na produção.

### Testes e homologação

- Não repetir homologação completa já aprovada sem justificativa.
- Alteração visual: build e verificação direcionada.
- Alteração funcional: o fluxo modificado e as dependências relevantes.
- Alteração de autenticação, permissão ou banco: teste de segurança específico.
- Não repetir migração, restauração ou teste extenso sem necessidade.

### Implementação

- Concluir a funcionalidade pedida.
- Não refazer análise quando a decisão já está documentada.
- Reutilizar componente, configuração e estrutura existentes.
- Não modificar funcionalidade aprovada sem necessidade.
- Não interromper para confirmação desnecessária.

### Segurança

- Preservar os dados reais.
- Manter o isolamento clínico entre as médicas.
- Preservar o acesso por perfil.
- Não comprometer autenticação, prontuário ou financeiro.
- Não executar deploy sem autorização expressa.

### Entrega

Ao concluir, informar o que foi implementado, os testes executados, os bloqueios reais, o commit e se está pronto para deploy.

### Tempo

Evitar processo repetitivo que alongue a implementação em 15 a 20 minutos. Preferir verificação incremental, evidência já válida e execução direta.

## Histórico

- 2026-11-02 — Diretriz de agilidade: o banco de trabalho é o BancoFlorescerPP. Cópia isolada só com necessidade comprovada. Sem deploy sem autorização expressa.
- 2026-10-30 — Hosped.1: baseline produção thvp.cloud / EasyPanel; system-state e infrastructure-history.
- 2026-10-21 — criado para a hospedagem self-hosted na VPS.
