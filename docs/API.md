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
- 200 grava o cookie `casa_session`, com o identificador da linha em `casa_sessions`. A senha não volta na resposta.
- 400 pedido inválido. 401 e-mail ou senha não conferem, com a mesma mensagem nos dois casos. 503 sessão da casa desligada. 500 falha interna, sem detalhe do banco.

### `GET /api/casa/session`

- 200 `{ "id": "<uuid do usuário>" }` se a assinatura for válida e a linha da sessão ainda estiver ativa.
- 401 sem cookie, com cookie sem identificador, ou com a linha revogada.

### `DELETE /api/casa/session`

Revoga a linha daquele identificador e apaga o cookie. 200.

### `POST /api/casa/password`

Troca a senha da conta da sessão. Exige cookie válido e linha ativa.

- Body: `{ "currentPassword": "...", "newPassword": "..." }`. A nova senha tem no mínimo 8 caracteres.
- 200 `{ "ok": true }` grava um hash Argon2id novo, apaga todas as sessões daquela conta e apaga o cookie. A senha não volta na resposta.
- 400 pedido inválido. 401 sessão ausente ou senha atual recusada, com a mesma mensagem nos dois casos de senha. 503 sessão da casa desligada. 500 falha interna, sem detalhe do banco.

### `POST /api/casa/password/recover`

Pede a redefinição. Não revela se o e-mail existe.

- Body: `{ "email": "..." }`
- 200 com a mesma mensagem para qualquer e-mail válido. Sem envio de e-mail, nenhum token é gravado.
- 400 e-mail inválido. 503 sessão da casa desligada.

### `POST /api/casa/password/reset`

Conclui a redefinição com o token recebido por e-mail, quando o envio existir.

- Body: `{ "token": "...", "newPassword": "..." }`. A nova senha tem no mínimo 8 caracteres.
- 200 `{ "ok": true }` grava Argon2id e apaga as sessões da conta. A senha não volta na resposta.
- 400 pedido inválido. 401 token recusado ou expirado. 503 sessão da casa desligada.

### `GET /api/casa/authorization`

Lê o perfil, os papéis e a organização da sessão, com RLS.

- 200 com o contexto de autorização. 401 sem sessão ativa. 503 sessão da casa desligada.

### `POST /api/casa/staff`

Cria um usuário da casa. Só o administrador principal passa. A rota não devolve a senha.

- Body: `email`, `fullName`, `password` (mínimo 8), `organizationId` e `memberships` com `practiceId` e `role` (`admin`, `physician` ou `secretary`).
- 200 `{ "id": "<uuid>" }`. 400 pedido inválido. 401 sem sessão. 403 a criação foi recusada. 503 sessão da casa desligada.

### `GET /api/casa/files` e `POST /api/casa/files`

Grava e lê foto, exame e PDF no volume privado. Sem `CASA_DATABASE_URL` ou sem `CASA_FILES_ROOT` responde 503. A resposta não traz o diretório raiz.

- `GET` recebe `kind` (`photo`, `exam` ou `document`) e `id`. O caminho lido é o gravado na linha. Exame e documento ainda passam por `can_read_exam_file`. Foto passa por `can_access_patient_photo`. Sem permissão ou sem arquivo: 404.
- `POST` recebe `multipart` com `kind` e `file`. Foto aceita JPEG, PNG ou WebP até 2 MB. Documento e exame aceitam PDF, JPEG, PNG ou WebP até 15 MB. Tipo ou tamanho fora disso responde 400 e não grava. Se o banco recusar depois da escrita, o arquivo novo é apagado.
- 200, 400, 403, 404 ou 503.

### `POST /api/encounters/transcribe` e `POST /api/orientations/transcribe`

Com `CASA_DATABASE_URL` e sem cliente Supabase, o áudio sai de `CASA_FILES_ROOT`. O caminho pedido precisa ser igual ao caminho gravado no segmento ou na versão. Sem essa igualdade a rota responde 403 e não lê o arquivo. O caminho publicado continua baixando o Storage quando o cliente existe.

## Histórico

- 2026-10-31 — C086: as duas rotas de transcrição leem o volume privado quando a URL da casa está no processo. O caminho precisa ser o gravado.
- 2026-10-31 — C085: `/api/casa/files` grava e lê no volume privado. A rota fica indisponível sem `CASA_FILES_ROOT`. A variável não foi gravada na produção.
- 2026-10-31 — a `0059` está no BancoFlorescerPP. As rotas `/api/casa/*` continuam inertes enquanto `CASA_DATABASE_URL` não existir no processo.
- 2026-10-31 — redefinição de senha, leitura de autorização e criação de staff. A `0059` ainda não foi aplicada no BancoFlorescerPP.
- 2026-10-31 — o cookie da sessão da casa passou a ter identificador. `DELETE` revoga a linha. `POST /api/casa/password` revoga todas as sessões da conta. As rotas clínicas continuam no cookie do Auth enquanto a casa não está ligada.
- 2026-10-31 — sessão da casa em `/api/casa/session`. As rotas clínicas continuam no cookie do Auth enquanto a casa não está ligada.
- 2026-10-22 — as duas rotas de transcrição passam a recusar um caminho de áudio que não seja o do registro autenticado.
