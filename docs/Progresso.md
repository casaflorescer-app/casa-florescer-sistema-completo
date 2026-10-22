# Progresso

## Histórico

- 2026-10-22 — A tela branca na navegação vinha do template, que recriava `<html>` e `<body>`. A casca foi para `app/(shell)/layout.tsx` (`layout-9`). Sessão que não responde em 8 segundos segue como ausente, e a ida ao login é carregamento inteiro. Build e navegação local conferidos. O ar só muda depois de um novo deploy do florescerweb.
- 2026-10-22 — Auditoria pré-produção na branch `auditoria-pre-producao`. A transcrição só baixa o áudio do próprio registro. UAT estrutural reexecutado. Sem banco isolado e sem deploy. Classificação no relatório: não apto para produção até o ar ser revisto. Relatório em `docs/auditoria-pre-producao.md`.
- 2026-10-22 — O primeiro acesso entrou. Ao navegar, a tela ficava branca porque `/app` perdia a casca e o roteador trocava o documento vazio. A casca permanece, `/app` não volta sozinho ao login e o botão Entrar recarrega a página. Ainda precisa de deploy do florescerweb.
- 2026-10-22 — A API pública voltou a responder. O login falhava com `email_provider_disabled` porque `ENABLE_EMAIL_SIGNUP=false` desliga a senha no GoTrue. A correção é `true` no `deploy/.env` da VPS e recriar só o serviço `auth`. O cadastro público continua desligado.
- 2026-10-22 — Clínica e primeiro administrador criados na VPS com `deploy/bootstrap-admin.sh`. E-mail, CNPJ e senha não foram registrados. O login no navegador ainda não conecta: `https://api.thvp.cloud` responde a página do EasyPanel “Service is not reachable”.
- 2026-10-22 — Com "entrada 8" no ar, o formulário permaneceu, mas só chegava o CSS da fonte (4 KB). O Tailwind ficou no template, que é o trecho incluído na resposta. O texto de conferência saiu da tela de login.
- 2026-10-22 — A imagem com "entrada 6" e o template novo ainda respondia sem abrir `<html>` nem `<body>`. A casca passou para `app/template.tsx` (`data-casa="layout-8"`, texto "entrada 8").
- 2026-10-22 — Com "entrada 6" no ar, o formulário aparecia e sumia. A resposta de `/login` não trazia `<html>` nem `<body>`. O layout raiz ficou só com essa casca (`data-casa="layout-7"`). Providers foram para `app/template.tsx`.
- 2026-10-22 — Com "entrada 5" no ar, `/login` respondeu 500 e o navegador mostrou exceção de cliente. A causa é `useAuth()` sem o provider do layout. O hook passou a tratar isso como sessão ausente.
- 2026-10-21 — Com `x-casa-rev: 3` no ar, `/login` continuou em 307 sem `?next=`. O middleware deixou de cobrir `/`, `/login` e `/auth`. A página de login ganhou o texto "entrada 4" para confirmar o próximo deploy.
- 2026-10-21 — O deploy com `force-dynamic` (build `cWgs9-6n4LyMzxeB3Pwda`) continuou em 307 `NEXT_REDIRECT` para `/login`. Rotas públicas passaram a responder sem reescrever o pedido e sem chamar o Auth. Guards ignoram `redirect("/login")` em caminho público. A resposta leva `x-casa-rev: 3`.
- 2026-10-21 — Login em ciclo 307 para `/login` no EasyPanel. Layout raiz passou a `force-dynamic` para o cookie de sessão não derrubar a página estática.
- 2026-10-21 — Preparação da hospedagem self-hosted: imagem standalone, Caddy, Supabase pinado com portas internas, geração de chaves, migrations e bootstrap do primeiro admin. Guia em `docs/Infraestrutura.md`.
- 2026-10-21 — Tentativa de criar o banco na VPS. SSH recusado. Ficou `deploy/up-db.sh` para rodar no servidor. O Postgres de produção ainda não existe.
