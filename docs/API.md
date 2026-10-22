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

## Histórico

- 2026-10-22 — as duas rotas de transcrição passam a recusar um caminho de áudio que não seja o do registro autenticado.
