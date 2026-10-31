# C069 — RELATÓRIO FINAL DE HOMOLOGAÇÃO DA V1

**Data:** 2026-10-31  
**Modo:** diagnóstico/homologação — sem alteração de código de produto neste passo; sem migration/db push/RLS/PATH_RULES/commit/push/deploy.

## 1. Baseline

| Item | Valor |
|---|---|
| Branch | `main` |
| HEAD conhecido | `3937787` (C068) + working tree local com UX permissões C069 (não necessariamente implantado) |
| Produção app | https://sistema.thvp.cloud |
| Produção API | https://api.thvp.cloud |
| Deploy | Manual EasyPanel (`push ≠ deploy`) |

## 2. Ambiente

| Ambiente | Uso neste ciclo |
|---|---|
| Produção thvp | Smoke HTTP + tentativa Auth |
| Supabase Cloud (`.env.local`) | **Não** usado (DNS ENOTFOUND / ≠ produção) |
| Conta homologação clínica (Médica) | Declarada pelo operador como configurada |
| Credenciais no Agent | **Ausentes** (`C069_MEDICA_EMAIL` / gestão / secretaria **UNSET**) |

## 3. Conta / perfil utilizado

| Perfil | Status |
|---|---|
| Médica (homologação) | **BLOCKED** — e-mail/senha de produção não fornecidos ao Agent; candidatos UAT Cloud → `Invalid login credentials` em `api.thvp.cloud` |
| Gestão | **BLOCKED** (mesma causa) |
| Secretaria | **BLOCKED** (mesma causa) |
| Anônimo | Exercitado (HTTP + HTML gate) |

## 4. Módulos cobertos neste ciclo

| Módulo | Como testado |
|---|---|
| Landing / Login / `/app` gate | HTTP público |
| Dashboard / Central / Exames / Campanhas (UI) | UAT estrutural C066/C068 |
| Permissões UX / PATH_RULES clínicos | UAT C069 permissions-ux |
| Agenda…Estoque…Relatórios (fluxos autenticados) | **BLOCKED** sem sessão |
| Prontuário / Obstétrica autenticados | **BLOCKED** sem sessão |
| Segurança URL anônima | HTML sem dump técnico; “Verificando sessão” |

## 5. PASS

| Teste | Resultado |
|---|---|
| UAT C068 estrutural | **17/17 PASS** |
| UAT C066 estrutural | **25/25 PASS** |
| UAT C069 permissions-ux | **10/10 PASS** |
| UAT C063 estrutural (trecho final) | PASS (suite executada) |
| HTTP `/` `/login` `/app` e rotas principais | **200** |
| Auth API produção responde | **401** sem chave (serviço vivo) |
| Storage version | **1.81.0** (ciclo anterior / infra) |
| HTML anônimo `/app/records` | gate de sessão; sem `SYSTEM_ADMIN` no HTML |
| PATH_RULES records/obstetrics = physician | COMPROVADO no código (UAT) |
| Trigger 0004 clínicos = physician | COMPROVADO no código (UAT) |
| Campanhas fora da nav V1 / WA = Web | COMPROVADO estrutural |

## 6. FAIL

Nenhum **FAIL** de produto autenticado comprovado (não houve sessão para exercitar fluxos).

## 7. BLOCKED

| Item | Motivo |
|---|---|
| Login Médica / Gestão / Secretaria em produção | Credenciais da conta de homologação **não** disponíveis ao Agent; UAT Cloud inválido na API thvp |
| Painel, Agenda, Pacientes, Prontuário, Retorno, Receitas, Exames (fluxo), Obstétrica (dados), Contratos clínicos, Salas/Aluguéis, Workforce, Estoque, Relacionamentos (fila), Relatórios | Exigem sessão autenticada |
| Segurança cross-role em runtime | Exige 3 perfis logados |
| Responsividade visual autenticada | Exige browser + sessão |
| Hosped.1d lacunas (PG/migrations/backup) | Pendência infra documentada — fora deste smoke UI |

## 8. Problemas encontrados

| # | Problema | Módulo | Causa aparente | Severidade | Recomendação |
|---|---|---|---|---|---|
| 1 | Homologação autenticada Agent impossível nesta sessão | Auth | Falta `C069_*_EMAIL` (+ senha) no canal seguro do Agent | **P0 homologação** | Disponibilizar credenciais produção via secret; reexecutar `uat-c069-auth-smoke.mjs` + smoke UI |
| 2 | Contas UAT `@exemplo.local` não autenticam em thvp | Auth | Massa Cloud ≠ Auth produção | P1 processo | Usar apenas contas criadas no Auth de `api.thvp.cloud` |
| 3 | UX permissões C069 pode não estar no EasyPanel ainda | Permissões | Alterações locais sem commit/deploy obrigatório | P2 | Commit + push + Implantar se quiser a UX em prod |
| 4 | Hosped.1d incompleto | Infra | Sem SSH/terminal | P0 infra (já documentado) | Aceitar ressalva ou fechar Hosped.1d |

## 9–10. Severidade / evidências

- Evidência Auth: `uat-c069-auth-smoke.mjs` → `BLOCKED — login * Invalid login credentials` em `api.thvp.cloud`.
- Evidência estrutural: saídas C066/C068/C069 permissions no log desta sessão.
- Evidência HTTP: códigos 200 nas rotas listadas; páginas protegidas com gate de sessão no HTML.

## 11. Regressões

Não detectadas nos UATs estruturais executados. Regressão autenticada: **N/A / BLOCKED**.

## 12. Segurança

| Check | Resultado |
|---|---|
| Anônimo não vê dump SYSTEM_ADMIN em `/app/records` HTML | PASS |
| PATH_RULES clínicos = physician (código) | PASS |
| Runtime “Gestão sem acesso clínico indevido” | **BLOCKED** (sem login gestão) |
| Secretaria vs Médica | **BLOCKED** |

Nenhum bypass comprovado; também nenhum isolamento cross-role comprovado em runtime nesta sessão.

## 13. Responsividade

**BLOCKED** — sem sessão/browser viewport autenticado. Não feito redesign.

## 14. Classificação final

### **C — BLOCKED** (homologação funcional autenticada)

Motivo objetivo: **não foi possível autenticar a conta de homologação em produção a partir do Agent**. Sem isso, os fluxos 2–15 do briefing permanecem não exercitados.

Complemento: UATs estruturais da superfície V1 (C066/C068/permissões) estão **PASS** — o produto *compilado/código* continua coerente com o fechamento C068, mas isso **não** substitui homologação autenticada.

---

## A V1 está pronta para apresentação aos clientes?

**NÃO** — ainda não declarar pronta **neste relatório**, porque:

1. Homologação autenticada (Médica/Gestão/Secretaria) em `sistema.thvp.cloud` = **BLOCKED**.  
2. Hosped.1d (paridade DB/backup) permanece **NÃO COMPROVADO** (ressalva infra).  

**Pode tornar-se SIM (tipicamente classificação B)** após:

1. Credenciais da conta de homologação no canal seguro do Agent (ou smoke manual pelo operador com o mesmo checklist).  
2. PASS nos fluxos Agenda → Encounter → Prontuário → Receita/Exame → Obstétrica → Gestão amostral.  
3. Aceite explícito da ressalva Hosped.1d **ou** fechamento das lacunas.

```text
Código alterado neste passo de homologação: NÃO (apenas este relatório)
Migration / db push / Commit / Push / Deploy: NÃO
```

## Próximo passo

1. Operador: fornecer ao Agent (secrets) e-mails das contas Gestão / Secretaria / Médica de **produção** (senha já em `UAT_B34_PASSWORD` se for a mesma, ou secret dedicado).  
2. Reexecutar `node scripts/uat-c069-auth-smoke.mjs` com `C069_SUPABASE_URL=https://api.thvp.cloud`.  
3. Completar checklist autenticado; só então reclassificar A/B.
