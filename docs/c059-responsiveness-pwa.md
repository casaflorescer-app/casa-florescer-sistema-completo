# C059 — Responsividade, PWA e acabamento operacional

## Objetivo

Uma única aplicação web em `/app`, utilizável em desktop, notebook, tablet e smartphone, instalável como PWA (standalone), sem versões paralelas `/app-mobile` / `/app-desktop`, e sem cache de dados clínicos.

## Arquitetura responsiva

| Camada | Comportamento |
|--------|----------------|
| Shell | `AppShell` + `AppHeader` sticky + `AppSidebar` |
| Desktop (≥1024px) | Sidebar permanente em grid `260px + conteúdo` |
| Mobile/tablet (&lt;1024px) | Drawer lateral com overlay, fecha ao navegar / Escape / overlay |
| Conteúdo | `overflow-x-clip`, padding com `safe-area-inset-bottom` |
| Tabelas densas | Desktop: tabela; Mobile: cards/lista (`md:hidden` / `md:block`) |

## Breakpoints (Tailwind)

- `sm` 640px — identidade do usuário no header
- `md` 768px — troca tabela ↔ cards
- `lg` 1024px — sidebar permanente

## Matriz de viewports (obrigatória)

1. 1440 × 900  
2. 1280 × 800  
3. 1024 × 768  
4. 768 × 1024  
5. 600 × 800  
6. 390 × 844  
7. 360 × 800  

## Desktop

- Largura útil aproveitada pelo grid do shell.
- Tabelas completas onde couber.
- Modais centralizados com scroll interno.

## Tablet / mobile

- Menu hamburger + drawer.
- Áreas de toque ≥ 44px (`min-h-11`).
- Cards para filas densas (Central, Políticas, Pacientes, Aluguéis, Estoque).
- Modais `items-end` em telas estreitas + `max-h` com `100dvh` + safe-area.

## Header

- Sticky + `env(safe-area-inset-top)` para notch/status bar em standalone.
- Botão Menu com `aria-expanded` / `aria-controls`.

## Alertas

- `GlobalAlertHost` ativo em `/app`.
- Mobile: ancorado na base (`safe-area-inset-bottom`) para não cobrir o menu.
- Desktop (`sm+`): abaixo do header sticky.

## Sidebar mobile

- Overlay escurecido.
- Fecha após navegação.
- `inert` + `aria-hidden` quando fechada em viewport &lt; lg.
- Bloqueio de scroll do `body` enquanto aberta.

## PWA

| Campo | Valor |
|-------|--------|
| Manifest | `/manifest.json` |
| `start_url` | `/app` (auth redireciona se necessário) |
| `scope` | `/` |
| `display` | `standalone` |
| `orientation` | `any` |
| Ícones | 192 / 512 (+ maskable reutilizando os mesmos arquivos) |
| Apple | `appleWebApp.capable`, `apple-touch-icon` |
| Viewport | `viewportFit: cover` |

### Instalação

- **Android (Chrome):** Instalar aplicativo — prompt nativo quando critérios forem atendidos.
- **iOS (Safari):** Compartilhar → Adicionar à Tela de Início. Sem push/background sync neste ciclo.

### Service worker

- Arquivo: `public/sw.js` (cache `florescer-static-v3`).
- **Somente** assets estáticos: `/icons/`, `/brand/`, `/_next/static/`, manifest.
- **Não** intercepta `navigate` (sem shell offline autenticado).
- **Não** cacheia APIs, HTML de `/app`, prontuário, SOAP, receitas, exames, documentos.
- Atualização: `skipWaiting` + `clients.claim` + limpeza de caches antigos (sem reload forçado no meio do atendimento).

### Limitações offline

O sistema **não** funciona offline para uso clínico. Preferível indisponibilidade a armazenar dados sensíveis localmente.

## Segurança de dados clínicos

- Sem `localStorage` / IndexedDB clínico neste ciclo.
- SW não contorna autenticação, RBAC, RLS, cross-practice ou IDOR.
- PATH_RULES preservadas.

## Placeholders fora do C059

- `/app/specialties` e `/app/reports` permanecem com `ModulePlaceholder` (fora de escopo).

## Testes

```bash
node scripts/uat-c059-structural.mjs
node scripts/uat-c059-responsive.mjs
node scripts/uat-c059-pwa.mjs
node scripts/uat-c059-security.mjs
npx tsc --noEmit
npm run build
```

Evidência de browser nos 7 viewports complementar ao UAT estático.
