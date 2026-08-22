# Arquitetura — Sistema Casa Florescer

Documento de auditoria. Data de referência: 22 de agosto de 2026.

Este arquivo descreve a arquitetura **encontrada no repositório**. Não é um plano de reescrita. O projeto já está iniciado e deve ser preservado.

Legenda usada neste documento:

- **Existe:** observado no código, no schema ou no fluxo de deploy.
- **Problema:** gap, risco ou inconsistência no estado atual.
- **Recomendação:** orientação técnica para a próxima etapa (ainda não executada).
- **Futuro:** fora do escopo imediato (módulos funcionais, VPS, mudança de `STATIC_EXPORT`).

---

## 1. Premissas preservadas

| Premissa | Status |
|---|---|
| O código vive no GitHub | **Existe.** Remote `origin`: `https://github.com/casaflorescer-app/casa-florescer-sistema-completo.git` |
| Banco e serviços atuais: Supabase | **Existe.** Cliente `@supabase/supabase-js` / `@supabase/ssr` e 7 migrations em `supabase/migrations/` |
| Uma única unidade: Casa Florescer | **Recomendação de produto.** O schema SQL ainda modela `organizations` (multi-org). A aplicação deve operar com **uma** organização. |
| Implantação futura em VPS própria | **Futuro.** Não configurar, não implantar, não containerizar nesta etapa. |
| GitHub Pages | **Existe** como hospedagem estática provisória. Manter como está. Não tratar Pages como implementação definitiva dos módulos de negócio. |
| Stack atual | **Existe** e deve ser mantida. Sem migração de banco, sem troca de framework. |

---

## 2. Tecnologias (estado atual)

| Camada | Tecnologia | Versão no repositório |
|---|---|---|
| Linguagem | TypeScript (`strict: true`) | `^5.6.3` |
| Frontend | Next.js App Router + React | `14.2.15` / `18.3.1` |
| Estilo | Tailwind CSS + PostCSS + Autoprefixer | `^3.4.13` |
| Ícones | lucide-react | `0.454.0` |
| Formulários | react-hook-form + @hookform/resolvers + Zod | `7.53.2` / `3.9.1` / `3.23.8` |
| Backend da aplicação | Route Handlers Next.js + middleware (artefatos em `_dynamic/`) | **Inativos** no build Pages |
| Banco | PostgreSQL (Supabase) | 7 migrations SQL |
| Acesso a dados | supabase-js + @supabase/ssr | `^2.45.4` / `^0.5.2` |
| ORM | Nenhum | SQL + tipos manuais em `lib/types/` |
| Pacotes | npm | `package-lock.json` gerado localmente; **não versionado** no Git no momento da auditoria |
| PWA auxiliar | `apps/pwa/` (Next mínimo + HTML/JS legado) | Excluído do `tsconfig` do app principal |

**Problema:** o build ignora erros de TypeScript e ESLint (`typescript.ignoreBuildErrors` e `eslint.ignoreDuringBuilds` em `next.config.mjs`). O `npm install` alerta vulnerabilidade conhecida no Next.js 14.2.15.

**Recomendação:** manter a stack. Não introduzir Prisma, outra UI kit ou outro BaaS. Tratar upgrade de Next e o `package-lock.json` versionado em etapa posterior de fundação — não nesta documentação.

---

## 3. Organização do código

```
casa-florescer-sistema-completo/
├── app/                      # App Router — portais por papel
├── components/               # Shell, gates, formulários, alertas
├── lib/                      # Domínio: auth, rbac, patients, ops, supabase
├── _dynamic/                 # Middleware, API e RoleGate para modo dinâmico (não ligados)
├── supabase/migrations/      # Contrato do banco
├── apps/pwa/                 # PWA legado (fila/salas)
├── public/                   # sw.js, manifest, tokens de marca
├── scripts/                  # copy-pwa-public.mjs
├── .github/workflows/        # Deploy GitHub Pages
├── docs/                     # Esta documentação
├── package.json
├── next.config.mjs
├── tsconfig.json
├── tailwind.config.ts
├── vercel.json               # Placeholder (raiz)
└── .env.example
```

**Existe:** navegação e ACL de módulos centralizados em `lib/nav.ts` e `lib/permissions.ts`. Cadastro de paciente com wizard + Zod em `components/patients/` e `lib/patients/`.

**Problema:** não há `README.md` na raiz (além desta pasta `docs/`). `apps/pwa/` convive com o app principal sem contrato claro de fronteira. Tipos em `lib/types/database.ts` cobrem só parte das tabelas SQL.

**Recomendação:** evoluir de forma incremental a partir de `lib/` + `app/`. Não reorganizar agora para `/features`. Pastas de feature podem nascer por extração quando um domínio deixar de ser protótipo.

---

## 4. Portais e rotas

Quatro áreas de interface, todas existentes como páginas Next:

| Prefixo | Papel de UI (`UiRole`) | Conteúdo |
|---|---|---|
| `/` e `/login` | público | Landing e login de demonstração |
| `/login/criar` | público | Tela de criar conta — **só UI, sem persistência** |
| `/auth/callback` | auth | Exchange de `code` Supabase no browser |
| `/gestao` | `manager` | Auditoria (estoque), contratos, estoque, usuários |
| `/medica` | `physician` | Obstetrícia, agenda, pacientes, prontuário, capacidade |
| `/secretaria` | `secretary` | Agenda, pacientes, exames, reagendamento, comunicação |
| `/paciente` | `patient` | Agenda, exames, anexos, cadastro |

**Existe:** layouts por área (`app/gestao/layout.tsx`, etc.) que usam `RoleLayout` / `PatientAppLayout`.

**Problema:** a maior parte das telas é protótipo (fixtures, dados hardcoded ou `localStorage`). Não confundir navegação pronta com módulo operacional.

**GitHub Pages:** continua sendo o canal atual de publicação estática. **Não** é a implementação definitiva dos módulos de negócio. Nenhuma alteração de Pages nesta etapa.

---

## 5. Autenticação e autorização

### O que existe

- Papéis de UI: `physician`, `secretary`, `manager`, `patient` (`lib/types/domain.ts`).
- Papéis de banco (`app_role`): `owner`, `admin`, `physician`, `secretary`, `inventory`, `finance`.
- `profiles.role` (texto): `admin`, `physician`, `secretary`, `patient`.
- Módulos ACL: `agenda`, `pacientes`, `exames`, `prontuario`, `obstetrico`, `capacidade`, `estoque`, `auditoria`, `contratos`, `permissoes`.
- Resolução de sessão Supabase em `lib/auth/hydrate.ts` (lê `profiles`, `user_practice_roles`, `patient_accounts`) — **só se o cliente Supabase estiver configurado**.
- Login atual (`app/login/ui.tsx`): e-mails de demonstração + senha fixa `florescer` + `localStorage` (`florescer_preview_role`).

### Problemas

1. O login **não** chama `supabase.auth.signInWithPassword`.
2. `components/layout/RoleGate.tsx` (versão ativa) é stub: `requireModule()` devolve `previewSession("manager")` e **não valida** o módulo.
3. Não há `middleware.ts` na raiz. Proteção de rota é client-side (`StaticAuthGates` + `canAccessPath`).
4. `isMasterAdminRole` trata `manager`/`admin` como bypass total de módulos; a sidebar do manager inclui também o portal da paciente.
5. Três vocabulários de papel no mesmo produto (UI, enum SQL, `profiles.role`).

### Recomendação (próxima etapa de fundação — não executar agora)

- Centralizar autorização em `lib/rbac.ts` / `lib/permissions.ts`; não espalhar regras nas telas.
- Mapear os perfis de produto sobre o que já existe, **sem dropar tabelas**:

  | Perfil previsto | Correspondência atual |
  |---|---|
  | SUPER_ADMIN | Não existe como papel próprio; o mais próximo é `is_master_admin()` / `manager` |
  | OWNER | `app_role = owner` (hoje cai na UI `manager`) |
  | MANAGER | `UiRole manager` / `profiles.role = admin` |
  | SECRETARY | `secretary` |
  | DOCTOR | `physician` |
  | TENANT_PROFESSIONAL | Apenas no SQL (sublocação); sem portal |

- Isolar o modo preview atrás de flag, para não ser o caminho de produção clínica.

### Futuro

Auth Supabase de verdade, cookies httpOnly, RoleGate dinâmico e papéis SUPER_ADMIN / TENANT_PROFESSIONAL na UI. Sem implementação nesta etapa.

---

## 6. Hospedagem e `STATIC_EXPORT`

### Estado atual (não alterar)

Em `next.config.mjs`, se a variável de ambiente `STATIC_EXPORT` **não** está definida, o default é **`true`**.

Com `STATIC_EXPORT=true`:

- `output: "export"`
- `trailingSlash: true`
- imagens sem otimizador
- no GitHub Actions, `NEXT_PUBLIC_BASE_PATH=/casa-florescer-sistema-completo`

CI: `.github/workflows/deploy.yml` publica o artefato `out/` no GitHub Pages.

O código dinâmico (middleware, APIs `preview-role`/`preview-acl`, RoleGate com `redirect()`) está em `_dynamic/` e **não entra** no build Pages. O próprio `next.config.mjs` documenta os passos para reativar o modo dinâmico (copiar `_dynamic/` para a raiz/`app`).

`lib/hosting.ts`: `isStaticHosting()` lê `NEXT_PUBLIC_STATIC_EXPORT === "true"`. Nesse modo o cadastro de paciente **não** faz upsert no Supabase; persiste em `localStorage`.

Não há `.env.local` no workspace auditado. `.env.example` lista `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `STATIC_EXPORT=true`.

### Problema

O default estático faz o produto parecer “no ar” no Pages, enquanto auth, RLS e persistência clínica **não** estão operacionais. Tratar Pages como sistema da clínica seria um erro de arquitetura.

### Recomendação (registrar apenas — não executar agora)

**Não alterar `STATIC_EXPORT` nesta etapa.** Não copiar `_dynamic/`. Não mudar o workflow de Pages.

Na **próxima etapa de fundação**, se o objetivo for operação real (auth no servidor, APIs, RLS exercitado, sessão httpOnly), será **tecnicamente necessário** passar a `STATIC_EXPORT=false` em ambientes que não sejam o preview estático. Isso habilita middleware e Route Handlers. O GitHub Pages, se mantido, permaneceria como canal de demonstração estática, separado da operação.

A implantação em VPS própria (Node, reverse proxy, HTTPS) usa o mesmo modo dinâmico. **Futuro:** Docker, Nginx, backups, monitoramento — não configurar agora.

---

## 7. Dados na aplicação (estado atual)

| Domínio | Fonte observada |
|---|---|
| Sessão | `localStorage` (preview). Hydrate Supabase existe, pouco usado no modo estático |
| Pacientes | `localStorage` chave `florescer_patient_cadastros` + seeds. Upsert SQL só se **não** static |
| Usuários / ACL | directory local (`lib/admin/directory.ts`) |
| Agenda, exames, obstetrícia, capacidade, alertas | fixtures em `lib/preview/fixtures.ts` ou dados na página |
| Salas, contratos, estoque | constantes em `lib/ops/spaces.ts` |
| Financeiro | schema SQL; **zero** cliente |

**Problema:** CPF, endereço e dados clínicos de seed/cadastro ficam no navegador do operador.

**Recomendação:** na fundação, persistir MPI e ficha clínica só no Supabase, com RLS. Não implementar o módulo agora.

---

## 8. Segurança e LGPD

| Controle | Estado |
|---|---|
| Autenticação | **Problema.** Demo no client |
| Autorização | **Existe** o desenho centralizado; **problema** no enforcement |
| Rotas | **Problema.** Sem middleware ativo |
| Validação | **Existe** no cadastro (Zod); fraca nas demais telas |
| Auditoria de ações | **Existe** tabela `audit_events`; **problema:** sem triggers; UI `/gestao/auditoria` é conferência de estoque |
| Sessão | **Problema.** `localStorage` no modo atual |
| Separação clínico / administrativo | **Existe** no SQL (`clinical_notes` sem write da secretária, `can_read_clinical`). **Problema:** na UI o manager vê todas as áreas |
| Secrets no Git | **Existe** proteção: `.env*` ignorado; só `.env.example` versionado |

**Recomendação:** não ligar dados reais de pacientes ao modo Pages. Completar RLS e auditoria **antes** de produção clínica.

**Futuro:** logs de VIEW/EXPORT, política de retenção, DPO/processos LGPD operacionais.

---

## 9. GitHub e CI

**Existe:**

- Branch única: `main` (18 commits na auditoria), conventional commits em português (`feat:`, `fix:`, `chore:`).
- Workflow `Deploy GitHub Pages` em push `main`/`master` e `workflow_dispatch`.
- Node 22 no CI; secrets `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
- Sem tags.

**Problema:** `.env.example` cita o repositório `casaflorescer-app/gestao-casa-florescer` (nome diferente do remote atual) e o script `scripts/setup-gmail-smtp.ps1`, que **não existe**.

**Recomendação:** manter o fluxo em `main`. Próximas alterações de código (depois desta documentação) devem ir em commits rastreáveis, sem `--force` em `main`.

---

## 10. Evolução modular (avaliação, sem implementação)

O brief futuro lista domínios (`/features/auth`, `patients`, `appointments`, `medical-records`, etc.).

**Avaliação:** a base **suporta** essa evolução. Não criar pastas vazias agora.

Ordem natural de extração, quando houver aprovação de módulos:

1. `auth` / `users` / `permissions` (fundação)
2. `patients`
3. `appointments` / `rooms`
4. `medical-records` / `pregnancy` / `exams`
5. `professionals` / `contracts`
6. `inventory` / `medications`
7. `finance` / `reports` / `audit`

Baixo acoplamento depende de: regras no domínio (`lib/` ou `features/`), UI só apresentando, RLS no Postgres como última linha de defesa.

---

## 11. Síntese

O Casa Florescer é um **protótipo navegável com schema de produto**. A arquitetura-alvo (Next.js + Supabase + uma unidade + RBAC central + VPS depois) é compatível com o que já está no repositório.

Nada nesta pasta `docs/` altera runtime, banco, Pages ou `STATIC_EXPORT`.
