# System State — Casa Florescer

Fotografia oficial. Atualizar após ciclos grandes de infra ou produto.

**Ciclo infra:** Hosped.1c (2026-10-30) — **C — BLOCKED** (sem terminal/SSH/psql)  
**Ciclo produto local:** C066 polish V1 (working tree; sem commit/deploy) — landing/menu/settings/legado UX  
**Motivo infra:** sem terminal EasyPanel autenticado, sem SSH, sem psql/Studio → impossível confirmar `bancoflorescer`, compose interno de `florescerapi`, migrations e backup operacional.

Legenda: **COMPROVADO** · **DOCUMENTADO** · **UI OPERADOR** · **OBSERVADO** · **INCONCLUSIVO** · **BLOCKED**

---

## Git

| Item | Valor | Confiança |
|---|---|---|
| Branch | `main` | COMPROVADO |
| HEAD | `a9aadff` | COMPROVADO |
| origin/main | `a9aadff` | COMPROVADO |
| Working tree | docs Hosped.1–1c + SQL multi-papel (sem commit) | COMPROVADO |
| Migrations Git | `0001` … `0055` (55) | COMPROVADO |

---

## Produção (público)

| Item | Valor | Confiança |
|---|---|---|
| App | https://sistema.thvp.cloud | COMPROVADO |
| API | https://api.thvp.cloud | COMPROVADO |
| DNS | ambos A → `2.25.151.136` | COMPROVADO |
| SSL | Let's Encrypt | COMPROVADO |
| Bundle | `api.thvp.cloud` (sem `*.supabase.co`) | COMPROVADO |
| Storage API version | `1.81.0` (`/storage/v1/version` → 200) | COMPROVADO |
| Auth/REST | `/auth/v1/health`, `/rest/v1/` → 401 | COMPROVADO |

---

## Acesso técnico (Hosped.1c)

| Via | Resultado |
|---|---|
| Terminal EasyPanel | **BLOCKED** (UI login exige sessão humana; sem API aberta) |
| Container shell | **BLOCKED** |
| SSH `deploy`/`root` | **FAIL** — Permission denied; sem chave em `~/.ssh` (só `known_hosts`) |
| psql / Studio | **BLOCKED** |
| `deploy/.env` local | **AUSENTE** |
| `.env.local` | existe; aponta Supabase **Cloud** (dev ≠ prod) |

```text
Terminal EasyPanel: FAIL / BLOCKED
SSH: FAIL
Container shell: FAIL / BLOCKED
DATABASE ACCESS: BLOCKED
```

---

## EasyPanel

| Item | Valor | Confiança |
|---|---|---|
| Projeto | `cap-romao` | UI OPERADOR |
| Painel | `http://2.25.151.136:3000/` HTTP 200, título Easypanel | COMPROVADO |
| Autenticação do painel | login HTML em `/login` | OBSERVADO |
| Versão EasyPanel | | BLOCKED |
| Compose interno `florescerapi` | | BLOCKED |

### Serviços (UI operador)

| Serviço | Tipo UI | Relação Casa Florescer |
|---|---|---|
| `florescerweb` | App | **DIRETA** — app produção (nome container histórico `cap-romao_florescerweb` em Memoria) |
| `florescerapi` | Compose | **DIRETA** — API/gateway |
| `bancoflorescer` | PostgreSQL | **CANDIDATO** — vínculo Auth/REST/Storage **INCONCLUSIVO** |
| n8n / n8n-db / n8n-runner | | **NÃO INTEGRADO** no código app |
| chatwoot (+ db/redis/sidekiq) | | **NÃO INTEGRADO** no código app |
| evolution-api (+ db/redis) | | **NÃO INTEGRADO** no código app |

---

## Topologia (evidência mista)

```text
INTERNET
  │
  ├─ :443/:80  sistema.thvp.cloud / api.thvp.cloud
  │     │
  │     ├─ [DOCUMENTADO Memoria] EasyPanel Traefik encaminha
  │     │     api.thvp.cloud → serviço Compose `porta-api`:80
  │     │
  │     └─ [COMPROVADO headers] resposta API: Server=Caddy,envoy
  │           Caddy encaminha /auth|/rest|/storage|/realtime|/graphql
  │           → gateway Envoy (alias kong no pin Git)
  │
  ├─ :3000 EasyPanel UI (exposta, HTTP)
  ├─ :22   SSH (aberto; auth falha)
  └─ :5432/:8000 TIMEOUT (não públicos)

sistema.thvp.cloud → florescerweb (Next) → https://api.thvp.cloud

bancoflorescer ──?── Auth / REST / Storage   ← INCONCLUSIVO sem inspect
```

**Proxy classificado:** **TRAEFIK (borda EasyPanel, DOCUMENTADO) + CADDY + ENVOY (COMPROVADO nos headers)**.  
Cadeia interna completa: **não inspecionada nesta sessão**.

---

## Banco

```text
BANCO CASA FLORESCER: INCONCLUSIVO
```

| Check | Resultado |
|---|---|
| Serviço EasyPanel `bancoflorescer` | UI OPERADOR |
| Imagem / versão PG / volume / hostname | BLOCKED |
| Auth→DB / REST→DB / Storage→DB | BLOCKED |
| Exposição pública 5432 | COMPROVADO fechado (TIMEOUT) |

---

## Supabase Self-Hosted

**PARCIAL**

| Componente | Evidência |
|---|---|
| Storage API | COMPROVADO version `1.81.0` |
| Auth path `/auth/v1` | COMPROVADO (serviço presente) |
| REST `/rest/v1` | COMPROVADO |
| Realtime path | COMPROVADO (401) |
| Gateway Envoy | COMPROVADO header |
| GoTrue container | BLOCKED |
| PostgREST container | BLOCKED |
| Studio | público 404; interno BLOCKED |
| Postgres `db` vs `bancoflorescer` | INCONCLUSIVO |

---

## Migrations / Schema / RLS / RPCs

| Item | Status |
|---|---|
| Git 0001–0055 | COMPROVADO |
| History VPS | **UNKNOWN** (todas) |
| Schema parity | BLOCKED |
| RLS runtime | BLOCKED |
| RPCs runtime | BLOCKED |
| db push / repair | **não executados** |

---

## Auth / Storage / RBAC (resumo)

| Área | Status |
|---|---|
| Auth endpoint | COMPROVADO vivo |
| Auth E2E | BLOCKED (sem credencial teste) |
| Storage endpoint | COMPROVADO vivo (1.81.0) |
| Buckets runtime | BLOCKED |
| PATH_RULES / multi-role modelo | COMPROVADO no Git |
| SQL god-mode | **NÃO APLICADO** |
| UAT autenticado | BLOCKED |

---

## Backup

| Item | Status |
|---|---|
| Script `deploy/backup.sh` | DOCUMENTADO — `docker exec supabase-db` |
| Container EasyPanel | `bancoflorescer` (nome ≠ `supabase-db`) |
| Existência de `supabase-db` | BLOCKED |
| Execução / arquivo / cron | **BACKUP OPERACIONAL = NÃO COMPROVADO** |
| Classificação | **C** |
| Restore | NÃO TESTADO |

---

## Integrações

| Stack | Código Casa Florescer | Classificação |
|---|---|---|
| Evolution | zero matches em `.ts/.tsx/.js` | **NÃO INTEGRADO** |
| Chatwoot | zero matches | **NÃO INTEGRADO** |
| n8n | zero matches | **NÃO INTEGRADO** |
| WhatsApp app | `wa.me` only (C065) | INTEGRADO (Web only) |

Isolamento de networks/volumes entre stacks: **BLOCKED** (sem `docker network ls`).

---

## Segurança

| Item | Status |
|---|---|
| Postgres não público | PASS |
| Studio não público | PASS |
| EasyPanel `:3000` HTTP público | **P1** (superfície admin) |
| Credencial VPS exposta (histórica) | **P0 — ROTATION REQUIRED** (status atual da credencial: BLOCKED verificar) |

---

## Pendências para desbloquear (operador)

Abrir no EasyPanel (copiar **nomes**, não senhas):

1. `bancoflorescer` → imagem, porta interna, volume, network, hostname  
2. `florescerapi` → lista de serviços do Compose (`porta-api`, auth, rest, storage, db?)  
3. Terminal em `bancoflorescer` ou `florescerapi` → `psql` read-only / `\dt` / migration history  
4. Confirmar se existe container/nome `supabase-db`  
5. Listar backups em disco / cron  

Ou: instalar chave SSH pública desta máquina no usuário `deploy`.

---

## Próximo ciclo

**Hosped.1d** — somente após terminal EasyPanel ou SSH: inventário compose + migrations + backup comprovado.
