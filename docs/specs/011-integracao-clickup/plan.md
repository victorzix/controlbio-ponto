# Plan — Integração com ClickUp

| Campo         | Valor                      |
| ------------- | -------------------------- |
| Status        | Em revisão                 |
| Autor(es)     | Victor · Equipe controlbio |
| Criada em     | 2026-09-02                 |
| Atualizada em | 2026-09-02                 |

> **Camada 2 — A ESTRATÉGIA.** Como vamos atacar o problema descrito em `spec.md`.
> Arquitetura em alto nível, decisões, dependências e riscos. O detalhe fino
> (DDL, contratos, telas) está no `design.md`.

## 1. Abordagem em uma frase

Um **produtor/consumidor dentro do próprio Postgres**: as Server Actions de ponto
gravam um _job_ na mesma transação em que salvam o registro, e um **worker separado**
(container próprio no compose) consome esse job e conversa com a API do ClickUp através
de uma **máquina de estados por etapa**, que torna o reprocessamento seguro.

## 2. Por que assim

O requisito que manda na arquitetura é o **RF-15/RNF de resiliência**: bater ponto não
pode depender do ClickUp. Isso elimina qualquer desenho síncrono. A partir daí:

- **Fila no Postgres, não em Redis/SQS.** O banco já existe, já tem backup e já é o
  limite de disponibilidade do sistema. `SELECT ... FOR UPDATE SKIP LOCKED` é uma fila
  correta e transacional. Adicionar um broker seria mais uma peça para operar numa VPS
  que hoje roda três containers.
- **Enfileirar na mesma transação do ponto.** Se o job fosse gravado depois do commit,
  uma queda entre os dois perderia a sincronização silenciosamente. Na mesma transação,
  ou os dois existem ou nenhum.
- **Worker em container próprio.** Um laço dentro do processo do Next morreria junto com
  a aplicação, competiria por CPU com requisições e quebraria no dia em que houver duas
  réplicas. O `Dockerfile` já tem o estágio `tools` (com `tsx` e o código-fonte) — o
  custo marginal é um serviço no compose e um `npm script`.
- **Máquina de estados por etapa.** O pipeline faz várias chamadas de escrita (criar
  tarefa, comentar, lançar tempo). Sem persistir o progresso, um retry após falha parcial
  duplicaria comentário — violando **RN-13**. Cada etapa concluída é gravada antes da
  próxima começar.

## 3. Stack e dependências

**Sem dependência nova.** Tudo é feito com o que o projeto já tem:

| Necessidade         | Ferramenta                                            |
| ------------------- | ----------------------------------------------------- |
| HTTP para o ClickUp | `fetch` nativo do Node 26                              |
| Fila e persistência | Postgres 18 + Drizzle (já no projeto)                  |
| Cifra do token      | `node:crypto` (AES-256-GCM), nativo                    |
| Processo do worker  | `tsx` (já é devDependency, já está no estágio `tools`) |
| Validação           | Zod (já no projeto)                                    |
| Estado no client    | React Query (já montado em `providers.tsx`)            |
| Formulários         | React Hook Form + Zod (`CLAUDE.md` §7)                 |
| UI / animação       | shadcn/ui + Tailwind + `motion` (`CLAUDE.md` §2 e §3)  |

**Variáveis de ambiente novas** (todas em `.env.example`):

| Variável                     | Papel                                          | Padrão |
| ---------------------------- | ---------------------------------------------- | ------ |
| `CLICKUP_API_TOKEN`          | Token de serviço (`pk_...`)                    | —      |
| `CLICKUP_TEAM_ID`            | Workspace de destino                           | —      |
| `CLICKUP_TOKEN_ENC_KEY`      | Chave AES-256 (base64, 32 bytes) do token pessoal | —   |
| `CLICKUP_SYNC_ENABLED`       | Liga/desliga a integração inteira              | `true` |
| `CLICKUP_RATE_LIMIT_PER_MIN` | Teto de requisições por minuto                 | `90`   |
| `CLICKUP_WORKER_POLL_MS`     | Intervalo de sondagem do worker                | `5000` |
| `CLICKUP_MAX_ATTEMPTS`       | Tentativas antes de exigir reenvio manual      | `5`    |

Sem `CLICKUP_API_TOKEN`, a integração fica **inerte**: nada é enfileirado, nada quebra,
a tela de configuração avisa que falta configurar. Isso mantém o ambiente de
desenvolvimento e os testes funcionando sem credencial.

## 4. Camadas e responsabilidades

```
Server Actions (ponto / tracking)
        │ enfileira na mesma transação
        ▼
  clickup_sync_jobs  ◄────────── worker (container próprio)
        │                              │
        │                        pipeline por etapa
        │                              │
        ▼                              ▼
  registros_ponto              ClickUpClient (HTTP + rate limit)
  (estado de sync)                     │
                                       ▼
                                  API do ClickUp
```

- **`src/lib/clickup/`** concentra a integração. Lógica **pura** (normalização de
  título, janela de sprint, classificação de status, cifra) fica em módulos separados e
  sem I/O — é o que os testes cobrem de verdade.
- **O cliente HTTP é injetado** no pipeline. Isso permite testar o pipeline inteiro com
  um cliente falso, sem rede e sem credencial.
- **O worker é burro:** só reivindica job, chama o pipeline e grava o resultado. Toda a
  regra vive no pipeline.

## 5. Decisões e alternativas descartadas

| Decisão                                         | Alternativa descartada                        | Por quê                                                                                              |
| ----------------------------------------------- | --------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Fila no Postgres                                 | Redis / broker externo                        | Mais uma peça para operar; o banco já é o limite de disponibilidade                                   |
| Worker em container próprio                      | Laço em `instrumentation.ts` / cron na VPS    | Isolamento de falha, reinício automático, sem configuração fora do repositório                        |
| Máquina de estados por etapa                     | Job atômico "tudo ou nada"                    | Sem ela, retry duplica comentário (RN-13); o ClickUp não oferece escrita idempotente                  |
| Token de serviço + vínculo de membro             | OAuth por usuário                             | OAuth exige app, callback e renovação de token — desproporcional para uma equipe pequena               |
| Token pessoal **opcional** só para lançar tempo  | Exigir token de todo mundo                    | Onboarding morre na prática; e sem token o essencial (tarefa + comentário) continua funcionando        |
| Chave de busca `(projeto, título normalizado)`   | Chave incluindo a sprint                      | Com carry over a tarefa **migra** de sprint; a sprint é atributo da tarefa, não parte da identidade    |
| `time_estimate` intocado                         | Escrever horas na estimativa                  | Estimativa é decisão de quem planeja; escrever realizado ali corrompe o dado do time                   |
| Enum `project` mantido                           | Tabela `projects`                             | Migrar o enum vaza para ponto, tracking, relatórios e filtros — refactor fora do escopo desta feature  |

## 6. Faseamento

Cada fase termina em software que roda e é testável sozinho.

1. **Fundação** — schema, migration, permissão de RBAC. Nada visível ainda.
2. **Núcleo puro** — normalização de título, janela de sprint, classificação de status,
   cifra do token. Tudo com teste unitário, sem rede.
3. **Cliente HTTP** — `ClickUpClient` tipado, com rate limit e erros classificados
   (recuperável vs. terminal). Testado com `fetch` falso.
4. **Fila e pipeline** — enfileiramento, reivindicação, backoff e a máquina de estados.
   Testado ponta a ponta com cliente falso.
5. **Gatilhos** — as Server Actions de ponto e de tracking passam a enfileirar.
6. **Worker** — entrypoint, script npm, serviço no compose.
7. **Telas** — configuração do admin, vínculo de membro, conta pessoal, estado de sync
   no card do ponto, interruptor de revisão no encerramento.
8. **Documentação** — `design-system.md`, `deploy.md`, `.env.example`, `acceptance.md`.

As fases 1–6 entregam a integração **funcionando** (configurável por `.env` e por SQL);
a fase 7 é o que torna isso operável por uma pessoa não técnica.

## 7. Riscos

| Risco                                                                                     | Impacto                                     | Mitigação                                                                                                                     |
| ----------------------------------------------------------------------------------------- | ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| **Listas de sprint sem data preenchida** (Q-01)                                            | Sprint resolvida pelo nome, que é frágil    | Data da Lista é o caminho primário; parse de nome é rede de segurança, configurável por projeto e coberto por teste; se nada casar, cai no backlog e **sinaliza** — nunca erra em silêncio |
| **Limite de 100 req/min** com alguém lançando o mês atrasado                                | Erros 429 em massa                          | Token bucket global no worker (padrão 90/min) + respeito ao `X-RateLimit-Reset`; a fila degrada em vazão, não em erro           |
| **Título genérico** ("reunião") colidindo entre atividades diferentes                       | Comentários no lugar errado                 | Escopo da chave é o **projeto**, não o workspace; documentar a convenção. Se virar problema real, a saída é vínculo explícito — mudança localizada no `resolve` |
| **Token pessoal vazando**                                                                   | Acesso indevido ao ClickUp de alguém        | AES-256-GCM em repouso, nunca devolvido ao navegador, nunca em log; chave fora do banco                                        |
| **Descrição do ponto exposta no workspace**                                                 | Privacidade                                 | Aviso explícito na tela de lançamento e na tela de conta (RNF de privacidade)                                                  |
| **Worker parado sem ninguém perceber**                                                      | Board silenciosamente desatualizado         | Estado de sync visível no próprio card do ponto + contador de pendências na tela de integração                                 |
| **Mudança de status/estrutura no ClickUp** (folder renomeado, status removido)               | Falhas em massa                             | Erro terminal com mensagem clara e botão "testar" na tela de configuração para diagnosticar antes de liberar                    |

## 8. Fora do plano

Tudo que a `spec.md` §3 listou como fora de escopo, e mais: nenhuma alteração no cálculo
de horas, nos relatórios (spec 006) ou na visão de equipe (spec 007). A integração é
**aditiva** — se `CLICKUP_SYNC_ENABLED=false`, o sistema se comporta exatamente como hoje.

## 9. Como validar

- **Unitário (`npm test`):** núcleo puro e pipeline com cliente falso — cobre RN-01 a
  RN-14 sem tocar a rede.
- **Integração manual:** roteiro em `acceptance.md`, executado contra um espaço de teste
  do ClickUp (o workspace já tem `Espaço Teste`).
- **Verificação de Q-01:** antes da fase 4, chamar `GET /v2/folder/{id}/list` com token
  real e conferir se `start_date`/`due_date` vêm preenchidos. O resultado decide se o
  parse de nome é rede de segurança ou caminho principal.
