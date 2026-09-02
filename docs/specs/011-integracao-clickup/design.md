# Design — Integração com ClickUp

| Campo         | Valor                      |
| ------------- | -------------------------- |
| Status        | Em revisão                 |
| Autor(es)     | Victor · Equipe controlbio |
| Criada em     | 2026-09-02                 |
| Atualizada em | 2026-09-02                 |

> **Camada 3 — O DETALHE.** Planta baixa da implementação: modelo de dados, contratos,
> fluxos, telas. Segue a estratégia do `plan.md` e atende os requisitos do `spec.md`.

## 1. Estrutura de arquivos

```
src/lib/clickup/
  crypto.ts        cifra/decifra do token pessoal (AES-256-GCM)     — puro
  title.ts         normalizeTitle()                                  — puro
  sprint.ts        janela de sprint (data da Lista → nome → backlog) — puro
  status.ts        classificação e resolução de status                — puro
  errors.ts        ClickUpError + classificação recuperável/terminal  — puro
  rate-limit.ts    token bucket honrando X-RateLimit-*                — puro
  client.ts        ClickUpClient (HTTP tipado)                        — I/O
  config.ts        leitura da configuração por projeto                — banco
  queue.ts         enfileirar / reivindicar / concluir / falhar       — banco
  links.ts         índice (projeto, título) → tarefa                  — banco
  pipeline.ts      máquina de estados do envio                        — orquestra
  members.ts       resolução de membro do workspace                   — I/O
  validation.ts    schemas Zod (configuração, token pessoal)
  data.ts          leituras para as telas
  actions.ts       Server Actions (configurar, testar, conectar, reenviar)

src/worker/
  clickup-sync.ts  entrypoint do worker (laço + encerramento limpo)

src/app/(app)/integracao/
  page.tsx                 Server Component (guarda de permissão)
  integracao-client.tsx    estado da conexão + lista de projetos
  project-config-form.tsx  formulário de um projeto (RHF + Zod)

src/components/
  conta-clickup.tsx        seção "ClickUp" dentro de Minha conta
```

**Modificados:** `src/db/schema.ts`, `src/lib/rbac.ts`, `src/lib/ponto/actions.ts`,
`src/lib/tracking/actions.ts`, `src/lib/ponto/data.ts`,
`src/app/(app)/ponto/ponto-entry-card.tsx`, `src/app/(app)/tracking-finalize-dialog.tsx`,
`src/app/(app)/usuarios/user-form.tsx`, `src/components/app-sidebar.tsx`,
`docker-compose.yml`, `package.json`, `.env.example`.

## 2. Modelo de dados

### 2.1 Colunas novas em tabelas existentes

```ts
// users
clickupUserId: integer("clickup_user_id"),                  // assignee no ClickUp
clickupTokenEnc: varchar("clickup_token_enc", { length: 512 }), // token pessoal cifrado
clickupTokenLabel: varchar("clickup_token_label", { length: 120 }), // "conectado como X"

// registros_ponto
clickupTaskId: varchar("clickup_task_id", { length: 64 }),
clickupTaskUrl: varchar("clickup_task_url", { length: 512 }),
clickupSyncStatus: clickupSyncStatusEnum("clickup_sync_status")
  .notNull().default("pending"),   // pending | synced | failed | off
```

`off` é o estado de quem foi criado com a integração desligada — distingue "não vai
sincronizar" de "ainda não sincronizou", e evita que ligar a integração empurre todo o
histórico (spec §3, fora de escopo).

### 2.2 Tabelas novas

```ts
// Configuração por projeto — RF-10, RF-11.
export const clickupProjectConfig = pgTable("clickup_project_config", {
  project: projectEnum("project").primaryKey(),
  spaceId: varchar("space_id", { length: 64 }).notNull(),
  folderId: varchar("folder_id", { length: 64 }).notNull(),
  backlogListId: varchar("backlog_list_id", { length: 64 }).notNull(),
  // Status resolvidos por ID (nome muda; ID não).
  inProgressStatus: varchar("in_progress_status", { length: 120 }).notNull(),
  doneStatus: varchar("done_status", { length: 120 }),
  // Fallback do parse de nome de sprint: 'dmy' (1/9/26) ou 'mdy' (7/8).
  sprintDateFormat: varchar("sprint_date_format", { length: 8 })
    .notNull().default("dmy"),
  enabled: boolean("enabled").notNull().default(true),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull().defaultNow().$onUpdate(() => new Date()),
  updatedBy: uuid("updated_by").references(() => users.id, { onDelete: "set null" }),
});

// Índice (projeto, título) → tarefa. Evita re-buscar no ClickUp a cada ponto.
export const clickupTaskLinks = pgTable("clickup_task_links", {
  id: uuid("id").primaryKey().defaultRandom(),
  project: projectEnum("project").notNull(),
  normalizedTitle: varchar("normalized_title", { length: 160 }).notNull(),
  clickupTaskId: varchar("clickup_task_id", { length: 64 }).notNull(),
  clickupTaskUrl: varchar("clickup_task_url", { length: 512 }).notNull(),
  sprintListId: varchar("sprint_list_id", { length: 64 }).notNull(),
  createdAt: timestamp(...).notNull().defaultNow(),
  updatedAt: timestamp(...).notNull().defaultNow().$onUpdate(...),
}, (t) => [
  uniqueIndex("clickup_task_links_project_title_idx").on(t.project, t.normalizedTitle),
]);

// A fila.
export const clickupSyncJobs = pgTable("clickup_sync_jobs", {
  id: uuid("id").primaryKey().defaultRandom(),
  kind: clickupJobKindEnum("kind").notNull(),        // push_entry | correction
  entryId: uuid("entry_id").notNull()
    .references(() => registrosPonto.id, { onDelete: "cascade" }),
  stage: clickupJobStageEnum("stage").notNull().default("resolve"),
  status: clickupJobStatusEnum("status").notNull().default("pending"),
  attempts: integer("attempts").notNull().default(0),
  nextRunAt: timestamp(...).notNull().defaultNow(),
  lastError: text("last_error"),
  // Progresso persistido — é o que garante a idempotência (RN-13).
  clickupTaskId: varchar("clickup_task_id", { length: 64 }),
  clickupCommentId: varchar("clickup_comment_id", { length: 64 }),
  clickupTimeEntryId: varchar("clickup_time_entry_id", { length: 64 }),
  // Encerramento do cronômetro pediu para mover ao status de conclusão (RF-09).
  moveToReview: boolean("move_to_review").notNull().default(false),
  createdAt: ..., updatedAt: ...,
}, (t) => [
  index("clickup_sync_jobs_pickup_idx").on(t.status, t.nextRunAt),
  index("clickup_sync_jobs_entry_idx").on(t.entryId),
]);
```

**Enums novos:** `clickup_sync_status` (`pending|synced|failed|off`), `clickup_job_kind`
(`push_entry|correction`), `clickup_job_stage` (`resolve|comment|time_entry|finish|done`),
`clickup_job_status` (`pending|running|done|failed`).

**`ON DELETE CASCADE` em `entry_id`** implementa **RN-07**: excluir o ponto remove o job
pendente e não toca em nada no ClickUp.

### 2.3 A chave de identidade (RN-01)

O índice único é `(project, normalized_title)` — **sem** a sprint. É a tradução direta de
**RN-01**: a sprint é atributo da tarefa, não parte da identidade, porque o carry over
(**RF-17**) faz a mesma atividade migrar de sprint em vez de gerar outra tarefa.

Consequência prática no índice: quando **RN-03** dispara (tarefa concluída na sprint
anterior), o `upsert` **reaponta** a linha existente para a tarefa nova. A tarefa
concluída deixa de ser referenciada — e continua intacta no ClickUp, como manda RN-07.

## 3. Configuração e resolução de destino

### 3.1 Escolha da sprint (RF-06, RF-07)

`pickSprintList(lists, workDate, format)` decide, em ordem:

1. **Data da Lista** — primeira Lista cujo intervalo `[start_date, due_date]` contém o
   `work_date`. Fonte confiável.
2. **Nome da Lista** — parse de `Sprint N (d/m/aa - d/m/aa)` ou `Sprint N (m/d - m/d)`
   conforme `sprintDateFormat` do projeto. Ano ausente é inferido do `work_date`,
   tratando a virada de ano (dezembro→janeiro).
3. **Backlog** — `backlogListId`. O ponto é marcado com aviso de "sprint não resolvida".

Nomes sem data alguma (`Sprint 3 - Abril`) e a própria Lista de backlog são **ignorados**
na etapas 1 e 2.

### 3.2 Classificação de status (RN-02, RN-03)

A API devolve, em cada status da Lista, um campo `type`:

| `type`                 | Classe no nosso domínio | Efeito ao receber um ponto            |
| ---------------------- | ----------------------- | ------------------------------------- |
| `open`, `unstarted`    | **parado**              | Move para o status de andamento       |
| `custom`               | **adiante**             | Não toca no status                    |
| `done`, `closed`       | **concluído**           | Não reaproveita — cria tarefa nova    |

Usar `type` (e não o nome) é o que faz a regra funcionar em `GPA` e em `RPA`, que têm
nomes completamente diferentes.

## 4. Pipeline — máquina de estados

Cada etapa **grava seu progresso antes** de a próxima começar. Um retry retoma da etapa
onde parou, nunca do começo (**RN-13**).

```
resolve ──► comment ──► time_entry ──► finish ──► done
```

### `resolve` — garantir a tarefa certa

1. Carrega a configuração do projeto. Ausente ou desabilitada → **falha terminal**
   (`CONFIG_AUSENTE`, RN-08).
2. Carrega `users.clickup_user_id`. Ausente → **falha terminal** (`SEM_VINCULO`, RN-09).
3. Resolve a Lista de destino (§3.1).
4. Busca a tarefa, em cascata:
   - **índice local** (`clickup_task_links` por projeto + título normalizado);
   - senão **busca no ClickUp** dentro do folder, casando título normalizado
     (`GET /v2/team/{team}/task?list_ids[]=...&include_closed=true`);
   - senão **cria** (`POST /v2/list/{list}/task`) já com `status = inProgressStatus`,
     `assignees: [clickupUserId]` e `markdown_description` com a descrição do ponto.
5. Tarefa encontrada:
   - status **concluído** → ignora e **cria nova** na Lista de destino (RN-03);
   - em Lista **diferente** da de destino → **move** (carry over, RF-17)
     via `PUT /v3/workspaces/{team}/tasks/{id}/home_list/{list}`;
   - status **parado** → `PUT /v2/task/{id}` com o status de andamento (RN-02);
   - usuário **não é assignee** → `PUT /v2/task/{id}` com `assignees: { add: [id] }`.
6. Grava `clickup_task_id` no job, no registro de ponto e no índice. → `comment`

### `comment` — registrar o trabalho (RF-05)

`POST /v2/task/{id}/comment`.

**A API não aceita markdown em comentário.** O campo `comment_text` é texto puro:
markdown enviado ali aparece como asterisco e hífen literais. Formatação exige o array
`comment`, com objetos `{ text, attributes }` (`bold`, `italic`, `code`, `link`, `list`).
Os dois formatos são alternativos — não se combinam no mesmo request.

Decisão: **cabeçalho rico, descrição crua**. O corpo é o array `comment` com dois itens:

```json
{
  "comment": [
    { "text": "25/06/2026 · 3h 20min", "attributes": { "bold": true } },
    { "text": "\n\nConfigurei o SSO e testei com dois usuários." }
  ]
}
```

A data e o tempo ficam em **negrito de verdade**; a descrição vai como um bloco de texto.
Descrição em prosa — o caso comum — fica perfeita. Se a pessoa usou markdown na
descrição, os marcadores aparecem literais: aceito conscientemente, porque converter
markdown para o array do ClickUp exigiria um parser próprio (alternativa avaliada e
descartada por YAGNI).

Para `kind = correction`, o texto em negrito vira `Correção · 25/06/2026 · 3h 20min`
(**RN-06**). O id vem no **nível raiz** da resposta (`{ id, hist_id, date }`), não sob
`data` — é ele que vai para `clickup_comment_id`. → `time_entry`

### `time_entry` — lançar tempo (RF-18)

Só executa se o usuário tiver token pessoal. Decifra, e chama
`POST /v2/team/{team}/time_entries` **com o token dele** (`tid`, `start`, `duration`).
Sem token, pula sem erro (**RN-12**). Grava `clickup_time_entry_id`. → `finish`

`start` é o início do dia trabalhado às 09:00 no fuso de Brasília — o ponto registra
duração, não horário. `duration` é `workedMinutes * 60_000`.

### `finish` — conclusão (RF-09)

Só executa se `move_to_review = true` **e** o projeto tiver `doneStatus`. Move a tarefa
para o status de conclusão. → `done`

### `done`

Job marcado `done`, registro de ponto marcado `synced`.

## 5. Cliente HTTP e erros

### 5.1 Endpoints usados

| Uso                             | Chamada                                                        |
| ------------------------------- | -------------------------------------------------------------- |
| Identidade do token             | `GET /v2/user`                                                  |
| Membros do workspace            | `GET /v2/team`                                                  |
| Popular selects (config)        | `GET /v2/team/{team}/space`, `/v2/space/{id}/folder`, `/v2/folder/{id}/list` |
| Status disponíveis              | `GET /v2/list/{id}`                                             |
| Buscar tarefa por título        | `GET /v2/team/{team}/task?list_ids[]=…&include_closed=true`     |
| Criar tarefa                    | `POST /v2/list/{id}/task`                                       |
| Status / assignee               | `PUT /v2/task/{id}`                                             |
| Carry over                      | `PUT /v3/workspaces/{team}/tasks/{id}/home_list/{list}`         |
| Comentar                        | `POST /v2/task/{id}/comment`                                    |
| Lançar tempo                    | `POST /v2/team/{team}/time_entries`                             |

Autenticação: header `Authorization: <token>` — **sem** `Bearer` para token pessoal
(`pk_...`), conforme a documentação.

### 5.2 Classificação de erro

| Situação             | Classe        | Ação                                                      |
| -------------------- | ------------- | --------------------------------------------------------- |
| `429`                | recuperável   | Aguarda até `X-RateLimit-Reset`, não conta tentativa       |
| `5xx`, rede, timeout | recuperável   | Backoff: 1min → 5min → 15min → 1h → 6h (`CLICKUP_MAX_ATTEMPTS`) |
| `401`, `403`         | terminal      | `TOKEN_INVALIDO` — alerta na tela de integração            |
| `404` na tarefa      | recuperável¹  | Limpa o índice e recria na próxima tentativa               |
| `400` de validação   | terminal      | `REQUISICAO_INVALIDA` com o corpo da resposta              |
| Configuração ausente | terminal      | `CONFIG_AUSENTE`                                           |
| Sem vínculo          | terminal      | `SEM_VINCULO`                                              |

¹ Recuperável **uma vez**: limpa o índice, reagenda imediato. Se falhar de novo, terminal.

### 5.3 Limite de requisições

Token bucket global no processo do worker: `CLICKUP_RATE_LIMIT_PER_MIN` (padrão 90, com
margem sob os 100 do plano). Toda resposta atualiza o bucket a partir de
`X-RateLimit-Remaining` e `X-RateLimit-Reset`. Quando esgota, o worker **espera** — a
fila fica mais lenta, nunca falha (**RNF de limite externo**, CA-19).

## 6. Telas

Todas mobile first (≥ 360 px), alvos ≥ 44 px, tokens semânticos do
`docs/design-system.md`, animação com `motion`.

### 6.1 `/integracao` (admin)

- **Cabeçalho de conexão:** "Conectado como \<nome\>" ou alerta de token ausente/inválido,
  mais o contador de pendências (jobs `failed`).
- **Um card por projeto** (Labphase, DW), empilhados no mobile:
  selects encadeados **Space → Folder → Lista de backlog → Status de andamento → Status
  de conclusão**, mais o formato de data da sprint e o interruptor de ativação.
  Os selects são carregados do ClickUp via React Query (`CLAUDE.md` §6 — client
  buscando/sincronizando).
- **Botão "testar"**: resolve a sprint de **hoje** e mostra o nome da Lista que receberia
  o ponto (**RF-19**, CA-13).
- Entrada nova na `app-sidebar`, visível só com `integracao:configurar`.

### 6.2 Minha conta — seção ClickUp

Input de token (`type="password"`), botões conectar/desconectar, estado "conectado como
\<nome\>". O token **nunca volta** ao navegador — a leitura devolve só o rótulo. Uma linha
explicando o efeito e outra avisando que a descrição do ponto vai para o ClickUp
(**RNF de privacidade**).

### 6.3 Usuários (admin)

Campo novo: **membro do ClickUp**, um select com busca sobre `GET /v2/team`,
pré-selecionado por correspondência de nome ou e-mail (**RF-12**).

### 6.4 Card do ponto

Badge de estado ao lado do badge de tempo, com transição via `motion`:

| Estado    | Aparência                                              |
| --------- | ------------------------------------------------------ |
| `pending` | Ícone de relógio, `text-muted-foreground`              |
| `synced`  | Link externo para a tarefa (o badge inteiro é o alvo)  |
| `failed`  | Badge `destructive` + ação "reenviar" (**RF-14**)      |
| `off`     | Nada é exibido                                          |

No mobile o rótulo colapsa e sobra só o ícone, preservando o alvo de 44 px.

### 6.5 Modal de finalização do cronômetro

Interruptor **"mover a tarefa para revisão"**, marcado por padrão, visível apenas quando
o projeto tem `doneStatus` configurado. Marcado → o **último** job gerado recebe
`move_to_review = true` (**RF-09**, **RN-04** — pausar não gera nada disso).

## 7. Pontos de gatilho

| Origem                            | Efeito                                                                   |
| --------------------------------- | ------------------------------------------------------------------------- |
| `createEntry` (`ponto/actions.ts`) | 1 job `push_entry` por registro criado, na mesma transação                |
| `updateEntry`                      | `clickup_task_id` nulo → `push_entry`; senão → `correction` (**RN-06**)   |
| `duplicateEntry`                   | 1 job `push_entry`                                                        |
| `deleteEntry`                      | Nada — o `ON DELETE CASCADE` remove o job pendente (**RN-07**)            |
| `finalizeTracking`                 | N jobs `push_entry`; `move_to_review` no último quando pedido             |
| Botão "reenviar"                   | Reagenda o job `failed` (`status='pending'`, `attempts=0`, mantendo o `stage`) |

Com `CLICKUP_SYNC_ENABLED=false`, nada é enfileirado e o registro nasce `off`.

## 8. Estratégia de testes

**Puro (sem rede, sem banco):**

- `normalizeTitle` — acento, caixa, espaços repetidos, extremidades.
- `pickSprintList` — data da Lista; parse `dmy` e `mdy`; ano ausente; virada de ano;
  Lista sem data; nenhuma casando → backlog.
- `classifyStatus` — os quatro `type` da API.
- `encryptToken`/`decryptToken` — ida e volta, chave errada, valor corrompido.
- `computeBackoff` — a progressão e o teto de tentativas.
- `classifyError` — cada linha da tabela §5.2.

**Pipeline com cliente falso:** cada ramo de `resolve` (cria / índice / busca / adota /
carry over / concluída→nova), o cabeçalho do comentário nos dois `kind`, o salto do
`time_entry` sem token, o `finish` condicional.

**Idempotência (o teste que mais importa):** executar o job a partir de cada `stage` e
afirmar que não há segunda criação de tarefa, comentário nem lançamento de tempo.

**Fila:** reivindicação concorrente com `SKIP LOCKED`, backoff, transição para `failed`
no teto de tentativas.
