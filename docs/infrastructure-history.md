# Histórico de infraestrutura — Casa Florescer

Preserva o histórico. Não substitui `docs/system-state.md` (estado atual).

---

## Linha do tempo

### 1) Fase inicial / preview

- Next com `STATIC_EXPORT` e GitHub Pages (demonstração).
- Supabase Cloud usado em desenvolvimento e ciclos iniciais.
- Autenticação e RLS evoluíram no schema `supabase/migrations/`.

### 2) Produção em Vercel (ciclos C040–C063)

- App SSR em Vercel (`casa-florescer-sistema-completo.vercel.app` e aliases).
- Banco frequentemente no projeto Supabase Cloud linkado ao CLI.
- Homologações documentadas em `docs/c063-final-homologation.md`.
- Workflow `.github/workflows/deploy.yml` ainda descreve Pages + menção a Vercel.

**Status hoje:** ambiente Vercel ainda responde HTTP 200 em `/login` → tratado como **LEGADO / PARALELO**, não como domínio oficial da clínica.

### 3) Migração para VPS Hostinger + EasyPanel (out/2026)

- VPS Hostinger (IP documentado `2.25.151.136`).
- EasyPanel projeto `cap-romao` (UI operador / Hosped.1b):
  - `florescerweb` — App Next
  - `florescerapi` — **Compose** (conteúdo interno NÃO inspecionado nesta sessão)
  - `bancoflorescer` — **PostgreSQL** dedicado (candidato a DB da Casa Florescer; vínculo não comprovado por inspect)
  - Co-hospedados no mesmo projeto: n8n (+db/runner), Chatwoot (+db/redis/sidekiq), Evolution API (+db/redis)
- Domínios oficiais:
  - `https://sistema.thvp.cloud`
  - `https://api.thvp.cloud`
- Documentação canônica de hospedagem: `docs/Infraestrutura.md`, `docs/Arquitetura.md`, `docs/Auth.md`, `AGENTS.md`.
- Compose do repositório: app + Caddy; pin Supabase (`deploy/SUPABASE_PIN`) — **não** comprovado como idêntico ao compose EasyPanel.
- Evidência pública: headers API **Caddy + Envoy**; EasyPanel UI em `:3000`.

### 4) Estado após Hosped.1 / 1b / 1c (2026-10-30)

- Produção web/API nos domínios thvp.cloud: **OPERANDO** (smoke público + SSL LE).
- Storage API version pública: **1.81.0**.
- Postgres `5432` não responde na internet (TIMEOUT).
- Hosped.1c: SSH e terminal EasyPanel continuam **BLOCKED** nesta máquina (sem chave; painel exige login humano).
- Paridade migrations Git↔`bancoflorescer`: **BLOCKED**.
- Supabase self-hosted: **PARCIAL** (paths + Storage 1.81.0 + Envoy); containers **NÃO COMPROVADOS**.
- Proxy: Memoria registra Traefik EasyPanel → Compose `porta-api`:80 (Caddy); headers públicos `Caddy,envoy`.
- Backup: script assume `supabase-db`; EasyPanel mostra `bancoflorescer` — execução **NÃO COMPROVADA** (class C).
- Credencial SSH exposta: **P0 — ROTATION REQUIRED**.
- Evolution/Chatwoot/n8n: **NÃO INTEGRADOS** no código TypeScript da Casa Florescer; WhatsApp app = `wa.me`.

---

## O que NÃO foi comprovado como “substituído”

| Afirmação | Evidência |
|---|---|
| “Supabase foi removido” | **Falsa** — Auth/REST/Storage via `api.thvp.cloud` |
| “Vercel foi desligada” | **Não comprovada** — `*.vercel.app` ainda responde |
| “Traefik é o proxy público da API” | Headers públicos mostram **Caddy + Envoy** |
| “Todas as migrations 0001–0055 estão na VPS” | **Não comprovado** |

---

## Fontes

- Código: `deploy/`, `Dockerfile`, `AGENTS.md`
- Docs: `Infraestrutura.md`, `Arquitetura.md`, `Auth.md`, `Progresso.md`, `Memoria.md`
- Hosped.1: probes HTTP + Git + UI EasyPanel (operador)
