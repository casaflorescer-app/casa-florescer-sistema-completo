# C060 — Gestão Clínica operacional

## Baseline

- Partiu de C059 `f180ae8` (main).
- Reutiliza C057 (`rental_contracts`) e C058 (estoque).
- Migration: `0052_c060_clinical_management.sql` — **aplicada no remoto** (db push autorizado).

## Princípios

| Conceito | Não confundir com |
|---|---|
| Profissional / médico locatário | Funcionário |
| Especialidade | Cargo/função de RH |
| Sala | Contrato |
| Aluguel de sala | Contrato obstétrico |
| Contrato obstétrico | Pré-natal clínico |
| Contrato/termo de procedimento | Atendimento / encounter |
| Termo de ciência | Checkbox |

## O que já existia (reuso)

- Salas: `rooms` + `RoomsBoard` (agora com CRUD operacional).
- Aluguéis: C057 completo (`/app/rentals`).
- Profissionais: `professionals` + board (rótulo corrigido para **Profissionais**).
- Documentos clínicos emitíveis: `clinical_document_artifacts` (receita/exame/orientação) — termos C060 usam tabela própria com vínculo opcional a artifact.

## Novo (migration 0052)

| Tabela | Papel |
|---|---|
| `clinic_specialties` | Catálogo de especialidades |
| `professional_specialties` | M2M profissional ↔ especialidade |
| `clinic_workforce` | Funcionários / prestadores (RH operacional) |
| `obstetric_availability_contracts` (+ events) | Disponibilidade obstétrica ligada à **paciente** |
| `procedure_agreements` (+ events) | Contrato/termo de procedimento + ciência rastreável |

`rental_contracts.specialty_id` (FK opcional) — texto `tenant_specialty` preservado.

### RPCs

- `clinic_specialty_upsert`
- `professional_specialty_set`
- `clinic_workforce_upsert`
- `obstetric_availability_contract_create|update|end`
- `procedure_agreement_create|acknowledge|cancel`

Todas: `SECURITY DEFINER`, `search_path = public`, `is_house_staff(owner|admin)`, `write_audit`.

## Rotas / menu (owner|admin)

| Item | Rota |
|---|---|
| Salas | `/app/rooms` |
| Aluguéis e locação | `/app/rentals` |
| Contratos de locação | `/app/rentals?tab=contracts` |
| Contratos clínicos | `/app/clinical-contracts` |
| Profissionais | `/app/professionals` |
| Especialidades | `/app/specialties` (placeholder **fechado**) |
| Funcionários | `/app/workforce` |
| Estoques | `/app/inventory` |

PATH_RULES: `/app/clinical-contracts`, `/app/workforce` = owner|admin.

Physician/secretary/patient/anonymous: sem mutação nas superfícies de Gestão Clínica. Médica pode **ler** contratos obstétricos/termos se `can_read_clinical(practice, patient)`.

## Limitações explícitas

- PDF/assinatura ICP-Brasil dos termos: **não** integrada neste ciclo; termo tem texto + versão + ciência registrada + eventos.
- Vínculo opcional `document_artifact_id` preparado; emissão PDF completa pode evoluir no padrão C040.7+.
- `/app/reports` permanece placeholder (C062).
- Equipamentos como classe de estoque: fora do C060.
- **db push 0052 aplicado.** Commit/push/deploy da aplicação aguardam autorização expressa.

## UAT

```bash
node scripts/uat-c060-structural.mjs
# Após db push:
node scripts/uat-c060-e2e.mjs
node scripts/uat-c060-security.mjs
node scripts/uat-c060-cleanup.mjs
```

Marcador: `UAT_C060_`.
