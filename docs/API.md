# API — Casa Florescer

O browser fala com o Supabase. O Next só expõe estas rotas. Todas exigem a sessão no cookie e respondem JSON.

## Autenticação

- Estratégia: Supabase Auth, sessão por cookie.
- Sem sessão: HTTP 401.
- A autorização do registro é a do usuário da sessão, com RLS e RPC. A rota não usa a chave `service_role`.

## Endpoints

### `POST /api/documents/render-pdf`

Gera o PDF de um documento clínico que a sessão já pode ler.

- Body: `{ "documentId": "uuid" }`
- 200, 400, 401, 404 ou 500.

### `POST /api/encounters/clinical-ai`

Pede uma sugestão de texto para um atendimento. A RPC `ai_assistance_request_create` recusa quem não é o profissional do atendimento.

- Body: `encounterId`, `suggestionType` e trechos de texto já limitados no servidor.
- 200, 400, 401, 403, 409, 422 ou 500.

### `POST /api/encounters/transcribe`

Transcreve o áudio já gravado de um segmento.

- Body: `transcriptionId` e `audioStoragePath`.
- O caminho precisa ser exatamente o `audio_storage_path` do segmento dessa transcrição. Outro caminho, ou um caminho com `..`, responde 403 ou 400 e o áudio não é lido.
- A RPC de resultado precisa autorizar o atendimento antes do download.
- 200, 400, 401, 403, 404, 422 ou 500.

### `POST /api/orientations/transcribe`

Transcreve o áudio de uma versão de orientação.

- Body: `versionId` e `audioStoragePath`.
- O caminho precisa ser exatamente o `audio_storage_path` dessa versão. A gravação do rascunho precisa ser autorizada antes do download.
- 200, 400, 401, 403, 422 ou 500.

### `POST /api/casa/session`

Entra na sessão da casa quando `CASA_DATABASE_URL` e `CASA_SESSION_SECRET` existem. Sem essas variáveis responde 503 e o login de produção não usa esta rota.

- Body: `{ "email": "...", "password": "..." }`
- 200 grava o cookie `casa_session`. A senha não volta na resposta.
- 400 pedido inválido. 401 e-mail ou senha não conferem, com a mesma mensagem nos dois casos. 503 sessão da casa desligada. 500 falha interna, sem detalhe do banco.

### `GET /api/casa/session`

- 200 `{ "id": "<uuid>" }` se o cookie for válido.
- 401 sem sessão.

### `DELETE /api/casa/session`

Apaga o cookie. 200.

## Histórico

- 2026-10-31 — sessão da casa em `/api/casa/session`. As rotas clínicas continuam no cookie do Auth enquanto a casa não está ligada.
- 2026-10-22 — as duas rotas de transcrição passam a recusar um caminho de áudio que não seja o do registro autenticado.
