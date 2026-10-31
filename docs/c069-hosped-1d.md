# Hosped.1d — Diagnóstico das lacunas (arquitetura confirmada)

**Data:** 2026-10-30 (atualizado com premissas do operador)
**Modo:** somente diagnóstico. Sem `db push`, SQL mutável, migration, repair ou alteração de infra.

## Resultado do ciclo

| Critério PASS | Estado |
|---|---|
| Premissas de arquitetura documentadas | **PASS** (fato operador) |
| Ligação `florescerweb`→`bancoflorescer` evidenciada no EasyPanel | **BLOCKED** (sem terminal/SSH) |
| Papel de `api.thvp.cloud` / `florescerapi` classificado com inspect | **PARCIAL** (público) / **BLOCKED** (compose) |
| Migrations Git vs banco | **INCONCLUSIVO** |
| Volumes comprovados | **BLOCKED** |
| Backup / restore | **NÃO COMPROVADO** / **NÃO TESTADO** |
| Auth + storage posicionados no diagrama | **PARCIAL** |
| Hosped.1d PASS completo | **NÃO** |

```text
Hosped.1d PASS = NÃO
V1 CONCLUÍDA = NÃO (gate infra)
```

---

## Premissas (fato do operador — não reinvestigar)

| Fato | Status |
|---|---|
| Hostinger VPS + EasyPanel | Confirmado |
| `florescerweb` = frontend + API/backend da Casa Florescer | Confirmado |
| `bancoflorescer` = PostgreSQL da Casa Florescer | Confirmado |
| Domínio app = `https://sistema.thvp.cloud` | Confirmado |
| Deploy `florescerweb` = **manual** EasyPanel (`push ≠ deploy`) | Confirmado |
| Supabase **Cloud** não é a infra atual | Confirmado |

### Diagrama-base (confirmado)

```text
                    INTERNET
                       │
                       ▼
              HOSTINGER VPS
                       │
                       ▼
                  EASYPANEL
                       │
                       ▼
                 florescerweb
                ┌──────┴──────┐
                │             │
             FRONTEND       API
                │             │
                └──────┬──────┘
                       │
                       ▼
               bancoflorescer
                  PostgreSQL
                       │
                       ▼
              VOLUMES / BACKUP   ← lacunas 4–5 ainda BLOCKED
```

Nós extras só entram no desenho com evidência (ver `api.thvp.cloud` abaixo).

---

## Acesso técnico nesta sessão

| Via | Resultado |
|---|---|
| SSH `deploy@2.25.151.136` | **FAIL** — Permission denied (publickey,password) |
| Terminal EasyPanel | **BLOCKED** (login humano) |
| psql / env inspect | **BLOCKED** |
| `deploy/.env` local | **AUSENTE** |

Sem inspect EasyPanel/SSH, lacunas de conexão, schema, volumes e backup **não** fecham.

---

## Evidências públicas (COMPROVADO)

| Check | Resultado |
|---|---|
| `sistema.thvp.cloud/` | HTTP 200 |
| Bundle JS referencia `api.thvp.cloud` | COMPROVADO (chunk Next) |
| `api.thvp.cloud/auth/v1/health` | 401 — Caddy + Envoy |
| `api.thvp.cloud/rest/v1/` | 401 — Caddy + Envoy |
| `api.thvp.cloud/storage/v1/version` | 200 — **1.81.0** |
| `api.thvp.cloud/realtime/v1/` | 401 |
| EasyPanel `:3000` | HTTP 200 |
| Git migrations `0001`–`0055` | **55** arquivos |
| HEAD | `3937787` (C068) |

---

## Lacunas (único escopo remanescente)

### 1. Conexão `florescerweb` → `bancoflorescer`

**Status: BLOCKED**

Operador confirma que a conexão existe. Falta evidência EasyPanel (env host/DB name mascarado, network, hostname interno).

### 2. `api.thvp.cloud` / `florescerapi`

**Status: PARCIAL**

| Evidência | Classificação |
|---|---|
| App em produção chama `api.thvp.cloud` | **EM USO** pelo cliente web |
| Paths `/auth` `/rest` `/storage` `/realtime` | **EM USO** (protocolo compatível com cliente `@supabase/ssr`) |
| Storage version `1.81.0` | Stack de storage **compatível com API Storage self-hosted** — **não** prova Supabase Cloud |
| Serviço EasyPanel `florescerapi` | UI operador existe; **não** assumir = API da Casa Florescer sem listar Compose |
| Onde os processos Auth/REST/Storage rodam (`florescerweb` vs `florescerapi` vs outro) | **BLOCKED** sem inspect |

**Código residual:** `NEXT_PUBLIC_SUPABASE_*` e `@supabase/supabase-js` em [`lib/supabase/client.ts`](../lib/supabase/client.ts) = **legado de protocolo/cliente** (nomes históricos), não evidência de Supabase Cloud.

### 3. Schema e migrations

**Status: INCONCLUSIVO**

- Git: histórico `0001`–`0055` COMPROVADO.
- Processo atual de aplicação no `bancoflorescer`: **DESCONHECIDO** (não presumir `supabase db push`).
- Histórico aplicado no PG: **NÃO COMPROVADO**.
- Cruzamento Git ↔ banco: **INCONCLUSIVO**.

### 4. Volumes

**Status: BLOCKED** (nome/mount/persistência).

### 5. Backup / restore

**Status: NÃO COMPROVADO / NÃO TESTADO**

[`deploy/backup.sh`](../deploy/backup.sh) usa `docker exec supabase-db`. Nome EasyPanel do PG = `bancoflorescer` → script no repo classificado como **desatualizado ou não usado** até prova na VPS. Classificação backup operacional: **C**.

### 6. Auth e arquivos

| Item | Posição atual |
|---|---|
| Login app | Via cliente → `api.thvp.cloud/auth` (COMPROVADO no bundle) |
| Arquivos | `api.thvp.cloud/storage` responde (COMPROVADO) |
| Processo EasyPanel que serve esses paths | **BLOCKED** |
| Buckets `public=false` | **BLOCKED** sem Studio/psql |

### 7. Segurança / deploy

| Item | Status |
|---|---|
| Deploy manual EasyPanel | Confirmado (operador) |
| EasyPanel `:3000` exposto HTTP | COMPROVADO (P1 superfície admin) |
| Postgres não público na internet | DOCUMENTADO em ciclos anteriores (TIMEOUT :5432) |

---

## Checklist PASS (reabrir quando houver acesso)

- [ ] Env `florescerweb` → host `bancoflorescer` (sem senha no chat)
- [ ] Compose/`florescerapi` inventariado; Auth/REST/Storage posicionados
- [ ] Histórico migrations no PG vs Git `0001`–`0055`
- [ ] Volume(s) PG persistentes
- [ ] Backup: path/data/tamanho ou “inexistente”
- [ ] Restore testado **ou** “NÃO TESTADO” aceito
- [ ] Diagrama final sem nós inventados
- [ ] `docs/system-state.md` alinhado

## Desbloqueio (operador)

1. Terminal EasyPanel em `florescerweb` e `bancoflorescer`, **ou** SSH `deploy`.
2. Colar outputs **mascarados** (nomes de env, hostname, volumes, `schema_migrations` ou equivalente).
3. Qualquer SQL/migration/`db push`: **somente com autorização expressa**.
