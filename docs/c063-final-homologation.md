# C063 — Homologação final do Sistema Casa Florescer

## Status

**B — APROVADO COM RESSALVAS** (ciclo C063)

O sistema é **operacional** no shell `/app`, com módulos essenciais publicados até C062 e correções P1 do C063.

| Métrica | Valor |
|---|---|
| P0 | 0 |
| Conclusão do produto | CONCLUÍDO COM RESSALVAS |
| Shell oficial | `/app` |
| HEAD C063 (publicado) | `6a67c8b` (Commit 063) |
| HEAD pré-C063 | `9e1fef8` (Commit 062) |
| Migration código | `0055` (storage own_encounters; usa `requested_by` / `exam_order_professional_id`) |
| Migration remota | **`0055` aplicada** (db push autorizado) |
| Deploy Production | READY — `casa-florescer-sistema-completo-kdazccw5w.vercel.app` |

## Baseline conhecido (C054–C062)

| Ciclo | Entrega | Classificação |
|---|---|---|
| C054–C056 | Receitas / exames / retorno / docs | A |
| C057 | Aluguéis | A |
| C058/C061 | Estoque + equipamentos | A |
| C059 | PWA / responsividade | A |
| C060 | Gestão clínica / contratos | A |
| C062 | Relatórios | A |

## Correções C063 (código)

1. **AlertProvider** — removido seed `previewAlerts` da superfície `/app`.
2. **Deep links** — `PatientsDirectory`, `PhysicianPatients`, `PatientRegistrationForm` apontam para `/app/patients` e `/app/records/patient/...`.
3. **Migration 0055** — storage/exames/áudios alinhados a `can_read_clinical` (own_encounters).

## Pendências

### P1 (não bloqueiam operação central)

| Item | Estado |
|---|---|
| Mock de alerta em `/app` | **Corrigido** no C063 |
| Links legados em componentes de pacientes | **Corrigido** no C063 |
| Storage own_encounters | **0055 aplicada** no remoto |
| Docs históricas (`architecture.md` / roadmap antigo) | Parcial — este doc + nota no roadmap |

### P2 / Fora de escopo

SNCR, ICP-Brasil, WhatsApp/email/push reais, financeiro, offline clínico, novos gráficos/filtros de reports.

## Segurança

| Tema | Resultado |
|---|---|
| Cross-practice | PASS (UAT C062 e anteriores) |
| Reports owner\|admin | PASS |
| Buckets clínicos `public=false` | PASS |
| Within-practice own_encounters (storage) | **PASS** — 0055 aplicada |
| SNCR/ICP simulados | Não |

## Matriz de módulos (resumo)

Painel, Agenda, Pacientes, Prontuário, Atendimento, Retorno, Receitas, Exames, Documentos, Portal, Central (stub sem canal real), Salas, Profissionais, Especialidades, Funcionários, Aluguéis, Contratos, Obstetrícia, Procedimentos, Estoque, Materiais, Equipamentos, Relatórios, PWA — **operacionais** no desenho atual.

## UAT C063

Scripts:

- `scripts/uat-c063-structural.mjs`
- `scripts/uat-c063-security.mjs`
- `scripts/uat-c063-e2e.mjs`
- `scripts/uat-c063-cleanup.mjs`

Marcador: `UAT_C063_`. Cleanup deve deixar `uat_left = 0`.

## Produção

URL: https://casa-florescer-sistema-completo.vercel.app

Deploy deve corresponder a `origin/main` após Commit 063.

## db push

`0055` aplicada com autorização expressa. Correção na migration: `exam_orders` não possui `professional_id` — usa `requested_by` (+ encounter via `exam_order_professional_id`).
