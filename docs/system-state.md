# System State — Casa Florescer

Fotografia oficial. Premissas de arquitetura **confirmadas pelo operador** (2026-10-30) têm prioridade sobre docs históricas.

**Ciclo infra:** Hosped.1d lacunas — **C — BLOCKED** nas lacunas internas (sem EasyPanel terminal/SSH)
**Ciclo produto:** C068 (`3937787`) em `florescerweb` (deploy manual EasyPanel)
**Gate V1:** não declarar concluída até Hosped.1d PASS + UAT autenticado produção

Legenda: **CONFIRMADO (operador)** · **COMPROVADO** · **DOCUMENTADO** · **UI OPERADOR** · **OBSERVADO** · **INCONCLUSIVO** · **BLOCKED**

---

## Arquitetura atual (confirmada)

```text
INTERNET
   ↓
HOSTINGER VPS + EASYPANEL
   ↓
florescerweb          ← frontend + API/backend (CONFIRMADO operador)
   ↓
bancoflorescer        ← PostgreSQL da Casa Florescer (CONFIRMADO operador)
   ↓
volumes / backup      ← ainda BLOCKED comprovar
```

| Item | Valor | Confiança |
|---|---|---|
| App oficial | https://sistema.thvp.cloud | CONFIRMADO / COMPROVADO |
| Deploy | Manual EasyPanel `florescerweb` | CONFIRMADO |
| Git push = deploy? | **Não** | CONFIRMADO |
| Supabase Cloud | **Não** é infra atual | CONFIRMADO |
| `florescerapi` | Serviço EasyPanel presente; papel **não** assumido como API CF | UI OPERADOR / BLOCKED inspect |

---

## Git

| Item | Valor | Confiança |
|---|---|---|
| Branch | `main` | COMPROVADO |
| HEAD | `3937787` | COMPROVADO |
| Migrations no Git | `0001` … `0055` (55) | COMPROVADO |
| Processo de apply no `bancoflorescer` | **DESCONHECIDO** (não presumir `supabase db push`) | BLOCKED |

---

## Produção (público)

| Item | Valor | Confiança |
|---|---|---|
| App | HTTP 200 | COMPROVADO |
| Cliente → `api.thvp.cloud` | Embebido no bundle Next | COMPROVADO |
| Auth `/auth/v1` | 401; Caddy+Envoy | COMPROVADO |
| REST `/rest/v1` | 401 | COMPROVADO |
| Storage version | `1.81.0` | COMPROVADO |
| Realtime | 401 | COMPROVADO |
| `X-Casa-Rev` | `3` (fixo; ≠ SHA) | COMPROVADO |

### Classificação protocolo `SUPABASE_*` no código

| Peça | Classificação |
|---|---|
| `@supabase/ssr` / `NEXT_PUBLIC_SUPABASE_*` | **Legado de protocolo/cliente** — app fala Auth/REST/Storage via esses nomes |
| Supabase Cloud (`*.supabase.co`) | **Não** é produção thvp (CONFIRMADO operador; `.env.local` local ≠ prod) |
| Onde Auth/REST/Storage rodam na VPS | **BLOCKED** (pode ser parte de `florescerweb`, `florescerapi`, ou outro) |

---

## Acesso técnico (Hosped.1d)

```text
SSH: FAIL
Terminal EasyPanel: BLOCKED
DATABASE INSPECT: BLOCKED
MIGRATION PARITY: INCONCLUSIVO
BACKUP OPERACIONAL: NÃO COMPROVADO (C)
RESTORE: NÃO TESTADO
```

---

## Lacunas abertas (não reinventar o que já é fato)

| Lacuna | Status |
|---|---|
| Env/network `florescerweb`→`bancoflorescer` | BLOCKED (fato da ligação: CONFIRMADO; evidência técnica: BLOCKED) |
| Inventário Compose / quem serve `api.thvp.cloud` | BLOCKED |
| Histórico migrations no PG vs Git | INCONCLUSIVO |
| Volumes persistentes | BLOCKED |
| Backup real vs `deploy/backup.sh` (`supabase-db`) | Script **desatualizado ou não usado** até prova; backup **NÃO COMPROVADO** |
| Buckets storage | BLOCKED |

Detalhe: [`docs/c069-hosped-1d.md`](./c069-hosped-1d.md).

---

## Co-hospedados EasyPanel (não integrados no app)

n8n · Chatwoot · Evolution — **NÃO INTEGRADOS** no TypeScript da Casa Florescer (WhatsApp app = `wa.me`).

---

## Segurança (resumo)

| Item | Status |
|---|---|
| Deploy manual | CONFIRMADO |
| EasyPanel `:3000` HTTP | COMPROVADO — P1 superfície |
| Postgres público | Não observado aberto (ciclos anteriores) |

---

## Próximo

1. Operador: Terminal EasyPanel ou SSH → fechar lacunas 1–6.
2. Atualizar este arquivo só com evidência.
3. UAT autenticado produção (C069) **após** Hosped.1d PASS.

---

## C076 — leitura do BancoFlorescerPP (2026-10-31)

| Item | Valor | Confiança |
|---|---|---|
| Database no serviço `bancoflorescer` | `postgres` e `BancoFlorescerPP` | COMPROVADO (leitura anterior, sem gravação) |
| `public.organizations` | ausente nos dois databases | COMPROVADO |
| Tabela com `practice` ou `organ` no nome | nenhuma em `BancoFlorescerPP` | COMPROVADO |
| `api.thvp.cloud` usa esse database | não | COMPROVADO pela ausência do schema da clínica |
| Schemas `auth`, `storage`, `extensions` | não listados por nome nesta sessão | INCONCLUSIVO |
| Apply, usuário, conexão, deploy | não feitos | CONFIRMADO nesta tarefa |

O código da casa está no repositório. A produção continua na API atual.
