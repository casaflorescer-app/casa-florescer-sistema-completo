# Auditoria pré-produção — 2026-10-22

## A. Resumo executivo

O Casa Florescer é um Next.js 14 com Supabase Auth e Postgres. A superfície oficial é `/app`. Há 75 páginas, 55 migrations e quatro rotas próprias. O restante dos dados sai do browser para o Supabase, protegido por RLS.

Nesta auditoria foram encontradas 6 falhas com evidência: 1 alta corrigida agora, 1 alta já corrigida no commit `correcao86` e revalidada no servidor local, 1 crítica e 2 altas de dependência sem correção, e 1 média deixada de propósito. Três asserções de UAT estavam desatualizadas e foram alinhadas ao código real.

Pendências bloqueiam a classificação de produção: não houve banco isolado, os UAT de segurança e de ponta a ponta não rodaram, e o login com navegação não foi revisto no ar depois do deploy.

Classificação: **NÃO APTO PARA PRODUÇÃO**.

## B. Resultados por categoria

| Categoria | Testes executados | Aprovados | Falhas | Pendências |
| --- | ---: | ---: | ---: | ---: |
| Backend | revisão das 4 rotas; `tsc` | 4 rotas com sessão; `tsc` sem erro | 1 alta de caminho de áudio, corrigida | UAT de ponta a ponta e de concorrência |
| Frontend | 25 scripts estruturais e de tipo; login e `/login/criar` no browser local | os 25 passaram depois do ajuste de 3 asserções | tela branca já corrigida em `correcao86`; revalidada localmente | as 75 telas não foram clicadas uma a uma |
| Responsividade | UAT estático C059 (23/23); browser em 375×667 e 1366×768 na tela de criar conta | sem rolagem horizontal nessas duas larguras | 0 | as outras sete resoluções, zoom 200% e os outros navegadores |
| Banco de dados | leitura das migrations 0001, 0041 e 0055 e das policies de áudio | integridade do caminho conferida no schema | 0 novas | nenhum teste contra banco; produção não foi consultada |
| Segurança | `npm audit` de produção; leitura de RLS e das rotas | sessão obrigatória nas quatro rotas | caminho de áudio corrigido; Next crítico e duas altas de dependência em aberto | UAT `security` não rodou: não há `.env.local` e o banco de produção está fora de alcance |
| Performance | inspeção, sem carga | n/a | 0 medidas | sem teste de carga |
| Integrações | leitura dos provedores de transcrição e de IA | a rota não chama o provedor se o caminho ou a RPC falha | 0 | SMTP vazio; WhatsApp sem canal real, já fora de escopo no C063 |
| Deploy | Git e código de hospedagem, sem publicar | branch `auditoria-pre-producao` a partir de `main` | 0 | deploy do EasyPanel não foi feito nem conferido |

## C. Correções realizadas

### Caminho de áudio na transcrição

- Problema: `POST /api/encounters/transcribe` e `POST /api/orientations/transcribe` baixavam o caminho enviado pelo browser. Quem já podia ler outro áudio da prática podia transcrever o arquivo de outro atendimento.
- Causa: o caminho não era comparado com `audio_storage_path`, e o download acontecia mesmo quando a RPC de autorização falhava.
- Arquivos: `app/api/encounters/transcribe/route.ts`, `app/api/orientations/transcribe/route.ts`.
- Solução: o caminho tem de ser exatamente o do registro; `..` é recusado; o download só ocorre depois da autorização.
- Teste: `tsc` sem erro. Não houve banco isolado para um teste de ponta a ponta.
- Resultado: a diferença de caminho passa a responder 403 sem ler o arquivo.

### Tela branca depois do login

- Problema: ao entrar, a navegação interna deixava o documento vazio.
- Causa: `/app` perdia a casca quando o servidor não via o caminho, e o roteador trocava a página por esse vazio. Já estava corrigido em `correcao86`.
- Teste local: `GET http://127.0.0.1:3489/app` respondeu 200 com “Casa Florescer” e “Verificando sessão…”. O clique de “Criar nova conta” abriu `/login/criar` com texto visível.
- Resultado: a correção permanece. O ar em `sistema.thvp.cloud` não foi implantado nem revisto nesta auditoria.

### Asserções de UAT desatualizadas

- Problema: três scripts falhavam por texto antigo, não por função ausente. A seção de gestão existe com o item “Salas”. O checklist de fechamento está em `EncounterFinalReview`, montado pelo workspace. O middleware ainda manda o portal legado ao login, sem a frase antiga `pathname = "/login"`.
- Arquivos: `scripts/uat-c041-structural.mjs`, `scripts/uat-c0404-clinical-support.mjs`, `scripts/uat-c056-structural.mjs`.
- Teste: os três scripts passaram de novo (23/23, 45/45 e 18/18).

## D. Pendências e limitações

- Não existe `.env.local`. Os scripts `uat-*-security.mjs`, `uat-*-e2e.mjs` e `uat-*-cleanup.mjs` não rodaram. Usá-los no Postgres de produção foi recusado.
- `npm audit` em dependências de produção: crítica no Next.js 14.2.15 (DoS com Server Actions e exposição no servidor de desenvolvimento) e altas em `postcss` e `source-map-js`. Não houve upgrade: trocar o Next mexe na imagem de produção e precisa de aprovação.
- `POST /api/documents/render-pdf` devolve `caught.message` no HTTP 500. É média. A mensagem pode sair do servidor. Não foi alterada nesta passagem para não mudar o contrato de erro sem um caso reproduzido.
- SMTP continua vazio. O login por senha funciona; o e-mail de nova senha não.
- Responsividade executada de verdade: só 375×667 e 1366×768, numa tela pública, no browser do Cursor. Chrome, Safari, Firefox e Edge não foram comparados. Zoom de 200% não foi medido.
- O primeiro servidor local em 3488 respondeu 404 em `/login` por `EMFILE` (muitos arquivos abertos). Com limite de arquivos maior, a porta 3489 serviu o login. Isso é limite desta máquina, não do código.
- Nenhum deploy, nenhum acesso ao banco da VPS e nenhuma credencial foi alterada.

## E. Avaliação de prontidão

**NÃO APTO PARA PRODUÇÃO.**

O código local da casca de `/app` e do caminho de áudio está consistente com os testes que puderam rodar. Falta ver o login e a navegação no servidor publicado, falta a suíte que fala com um banco isolado, e fica aberta a atualização crítica do Next.js.
