# C064 — Auditoria e modernização UX/UI

## Objetivo

Melhorar clareza, hierarquia de ações e consistência operacional — sem alterar regras clínicas, RLS, RBAC ou banco.

## Baseline

- HEAD de partida: `bd26b92` (C063.2)
- Migration remota: `0055` (sem migration neste ciclo)

## Problema central corrigido

Na lista de pacientes, ações empilhadas:

```
Ver detalhes
Abrir prontuário
```

(`flex-col items-end`)

**Padrão C064:**

`[ Prontuário ] [ ⋯ ]` — sempre em linha (`flex-nowrap`); label curto na lista para caber numa única linha horizontal.

Menu ⋯: Ver detalhes · Receitas · Exames · WhatsApp

## Componentes novos (`components/ui/`)

| Componente | Função |
|---|---|
| `buttonStyles.ts` | primary / secondary / tertiary / danger / ghost |
| `OverflowMenu.tsx` | Menu ⋯ acessível (aria + Escape) |
| `RowActions.tsx` | Ação principal + overflow (padrão obrigatório) |
| `PageHeader.tsx` | Título + descrição + ações do header |
| `EmptyState.tsx` | Estado vazio com contexto + CTA |

`components/platform/Ui.tsx` reexporta `buttonClass` / `ghostButtonClass` para compatibilidade.

## Telas alteradas

| Tela | Mudança |
|---|---|
| Pacientes (`PatientList`) | RowActions + PageHeader + EmptyState |
| Detalhe paciente | PageHeader + RowActions |
| Agenda (`AppointmentCard`) | Ação operacional primaria + ⋯ |
| Painel médico | RowActions nos próximos |
| Receitas / Exames | Header do paciente com RowActions |
| Aluguéis | CTA “Abrir contrato” (primary) |

## Padrão de ações

1. **Uma** ação principal visível (peso primary).
2. Secundárias no overflow `⋯`.
3. Sempre `flex-row` — **proibido** empilhar botões na coluna de ações de tabela.
4. Destrutivas: `danger` + confirmação existente (ex.: cancelar agenda).

## Fora de escopo / P2 futuro

- Redesign completo de Estoque / Relatórios / Contratos clínicos
- Design tokens CSS variables formais
- Skeleton loaders em todas as listas
- Unificar todos os StatusBadge do sistema

## Segurança

Nenhuma alteração em PATH_RULES, RLS, RPC ou PatientChart.

## UAT

`scripts/uat-c064-ux-structural.mjs`
