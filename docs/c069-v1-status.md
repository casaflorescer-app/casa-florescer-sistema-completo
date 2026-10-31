# C069 — Status de fechamento da V1

**Objetivo:** menor conjunto para declarar V1 pronta para apresentação.
**Roadmap não reaberto** (CRUD profissionais, financeiro, WA API, campanhas reais, SNCR/ICP, offline).

## Diagnóstico

Produto `/app` (C068) está **próximo** de apresentação. Declaração oficial **bloqueada** por:

1. **Hosped.1d lacunas** — arquitetura-base **confirmada pelo operador** (`florescerweb` + `bancoflorescer`); ainda **BLOCKED**: evidência env da ligação, quem serve `api.thvp.cloud`, paridade migrations, volumes, backup ([c069-hosped-1d.md](./c069-hosped-1d.md)).
2. **Homologação autenticada em produção** — contas UAT Cloud **não** autenticam em `api.thvp.cloud` (`Invalid login credentials`). Contas de teste de produção ainda não disponibilizadas ao Agent.

## Trabalho realizado neste ciclo

| Entrega | Status |
|---|---|
| Probes públicos thvp + SSH batch | Feito — SSH FAIL |
| Doc Hosped.1d | Feito — **BLOCKED** |
| Script `scripts/uat-c069-auth-smoke.mjs` | Feito |
| Smoke Auth produção (Gestão/Secretaria/Médica) | **BLOCKED** (credenciais) |
| Smoke Auth Cloud | **BLOCKED** (DNS `*.supabase.co` ENOTFOUND nesta máquina) |
| Correções de código P0/P1 | **N/A** (sem evidência autenticada de bug) |
| Massa demo em produção | **NÃO** (aguarda homologação) |
| Roteiro + checklist + NÃO MOSTRAR | Feito (abaixo) |

## Classificação de pendências

| Item | Classe | Notas |
|---|---|---|
| Terminal EasyPanel / SSH | A — operacional | Desbloqueia Hosped.1d |
| Contas teste prod (3 perfis) | A | Canal seguro; não versionar |
| Smoke autenticado | A | Após contas |
| Massa demo | A | Após smoke PASS |
| Patch código | B | Só se smoke achar P0/P1 |
| CRUD profissionais etc. | D | Pós-apresentação |

## Homologação autenticada — checklist (a executar)

Usar `node scripts/uat-c069-auth-smoke.mjs` com:

- `C069_SUPABASE_URL=https://api.thvp.cloud`
- `C069_SUPABASE_ANON_KEY` (anon pública do app)
- `UAT_B34_PASSWORD` ou e-mails/senha de **produção** via env seguro

Registrar só: perfil · fluxo · PASS/FAIL · erro sanitizado.

### Gestão

- [ ] Login
- [ ] Painel sem dump `SYSTEM_ADMIN` / práticas
- [ ] Salas · Aluguéis · Contratos clínicos · Especialidades · Funcionários · Estoque · Relatórios

### Secretaria

- [ ] Login · painel Secretaria
- [ ] Agenda · Pacientes · Relacionamentos (sem Campanhas)
- [ ] WhatsApp Web (`wa.me`)
- [ ] Sem edição SOAP

### Médica

- [ ] Login · PhysicianPanel OK (vínculo profissional)
- [ ] Agenda → encounter → SOAP → prontuário
- [ ] Receita / exame
- [ ] Sem Gestão Clínica indevida (salvo owner/admin)

## Massa de demonstração (mínima — após smoke)

| Área | Mínimo |
|---|---|
| Gestão | 2 salas; 1 especialidade; 1 workforce; 1 locação `active`; 1 item estoque |
| Secretaria | 3 pacientes c/ telefone; 3–5 slots no dia |
| Médica | 1 encounter aberto; receita + exame demonstráveis |
| Obstetrícia | Omitir se não estiver no roteiro |
| Profissionais | Usar existentes (RO) |

## Roteiro final

```text
GESTÃO → SECRETARIA → MÉDICA → (opcional) PORTAL
```

1. Gestão: painel → salas → aluguel → estoque → 1 indicador em relatórios.
2. Secretaria: mesma paciente na agenda → Relacionamentos → WhatsApp Web (envio manual).
3. Médica: atendimento → SOAP → exame/receita → prontuário.
4. Portal: só com conta paciente demo.

## NÃO MOSTRAR

- `/gestao`, `/medica`, `/secretaria` (legado + PREVIEW)
- `/app/relationships` (usar `/app/relationship`)
- Campanhas / `?tab=campaigns`
- `/app/system/*`
- IA/transcrição se SIMULAÇÃO
- Settings placeholder
- CRUD profissionais / financeiro / Evolution / Chatwoot / n8n

## Critério de encerramento

- [ ] Hosped.1d PASS (PG, migrations 0001–0055, volumes, Auth/Storage, docs)
- [ ] Backup classificado; restore testado **ou** “NÃO TESTADO” aceito por escrito
- [ ] Gestão / Secretaria / Médica PASS em produção
- [ ] Vínculo profissional da médica PASS
- [ ] Massa demo pronta
- [ ] Roteiro + NÃO MOSTRAR validados
- [ ] Zero P0/P1 abertos (ou mitigados na demo)

```text
V1 CONCLUÍDA E PRONTA PARA APRESENTAÇÃO AOS CLIENTES.
= AINDA NÃO
```

## Próximo passo

1. Operador: SSH ou Terminal EasyPanel → retomar Hosped.1d read-only.
2. Disponibilizar contas de teste **produção** ao Agent (canal seguro).
3. Reexecutar `uat-c069-auth-smoke.mjs` + smoke UI.
4. Só então massa demo e frase oficial de V1 concluída.

Migration / db push / Deploy EasyPanel neste ciclo: **NÃO REALIZADOS** pelo Cursor.
