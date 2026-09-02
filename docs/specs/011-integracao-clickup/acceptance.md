# Testes de Aceitação — Integração com ClickUp

> **Roteiro de testes executados por uma pessoa** (QA/usuário) para aceitar a feature.
> Lista os casos de uso a validar manualmente antes de considerar a feature pronta.
> Cada caso é rastreável aos critérios de aceitação (`spec.md` §9) e às regras de
> negócio (`spec.md` §7).

| Campo         | Valor                              |
| ------------- | ----------------------------------- |
| Versão testada| <preencher ao executar>            |
| Ambiente      | Local · Homolog · Produção         |
| Testado por   | <nome>                             |
| Data          | <AAAA-MM-DD>                       |

## ⚠️ O que não pôde ser verificado durante o desenvolvimento

Nenhum token real do ClickUp existiu no ambiente de build. Todo o núcleo (normalização
de título, janela de sprint, classificação de status, cifra, pipeline, fila) está
coberto por 205 testes automatizados com um `ClickUpClient` **falso** — mas as três
coisas abaixo só podem ser confirmadas rodando este roteiro contra o `Espaço Teste` do
workspace real, com um token de verdade:

- **Toda interação real com a API do ClickUp** — criação de tarefa, comentário,
  lançamento de tempo, movimentação de status, carry over entre sprints. O contrato dos
  endpoints (`design.md` §5.1) foi implementado a partir da documentação pública, nunca
  exercitado contra o servidor de verdade.
- **O runtime do Docker Compose** — um smoke test de `docker compose up --build worker`
  de ponta a ponta, e um `docker compose kill -s SIGTERM worker` para confirmar o
  encerramento gracioso (CT-24 e CT-25 abaixo). O código do sinal está correto para
  Linux, mas o ambiente de desenvolvimento é Windows e não consegue entregar um sinal
  Unix de verdade a um container — só foi possível ler o código, não observar o
  comportamento.
- **Se as Listas de sprint do workspace real têm `start_date`/`due_date` preenchidos**
  (`spec.md` Q-01). Sem isso confirmado, o caminho principal de escolha de sprint
  (data da Lista) pode estar sendo pouco exercitado na prática, e o parse de nome —
  pensado como rede de segurança — pode estar carregando mais peso do que o previsto.
  Ver CT-14 e a recomendação em Q-01.

Trate os casos abaixo como o primeiro contato real desta feature com o ClickUp.

## Pré-condições

- [ ] Ambiente no ar (`docker compose up -d --build`), incluindo o serviço `worker`
      (ver `docs/deploy.md`).
- [ ] `.env` com `CLICKUP_API_TOKEN`, `CLICKUP_TEAM_ID` e `CLICKUP_TOKEN_ENC_KEY`
      preenchidos com credenciais reais do workspace de teste.
- [ ] Em `/integracao` (como admin), pelo menos um projeto (Labphase ou DW) configurado
      apontando para o **Space/Folder do `Espaço Teste`**: Space → Folder → Lista de
      backlog → status "em andamento" → status "concluído" (opcional, mas necessário
      para CT-06) → salvo e testado com o botão **Testar**.
- [ ] Esse Folder tem uma Lista de sprint cujo intervalo cobre a data de hoje (ou cujo
      nome case com o formato configurado — ver CT-14/Q-01).
- [ ] Um usuário **funcionário** de teste, com **Membro do ClickUp** vinculado
      (`/usuarios` → editar → campo "Membro do ClickUp (opcional)") a um membro real do
      workspace de teste.
- [ ] Um usuário **admin** de teste, com acesso a `/integracao`.
- [ ] Opcional (para CT-18): o funcionário de teste com uma conta pessoal do ClickUp
      conectada em **Minha conta → ClickUp**.

---

## Casos de Teste

### Grupo A — Criação e reaproveitamento de tarefa

#### CT-01 — Ponto com título inédito cria tarefa nova

- **Objetivo:** confirmar que lançar ponto com um título que ainda não existe na sprint
  atual cria a tarefa, atribuída, em andamento, com o comentário do trabalho.
- **Referências:** _CA-01; RF-01, RF-02, RF-04, RF-05, RF-06, RF-08; RN-01_
- **Pré-condição:** não existe tarefa "Aceitação 011 — Criação" na sprint atual do
  Folder configurado.

| # | Passo                                                                                          | Resultado esperado                                                                                    |
| - | ------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------- |
| 1 | Como funcionário, em `/ponto`, clicar **"Novo registro"**.                                       | Abre o modal "Novo registro".                                                                              |
| 2 | Preencher Título = "Aceitação 011 — Criação", Projeto = o configurado, Dia = hoje, tempo e descrição. Clicar **"Salvar registro"**. | Modal fecha; o card do ponto aparece na lista com o badge de sincronização em estado "sincronizando" (ícone de relógio, `text-muted-foreground`). |
| 3 | Aguardar ~10–15s (o worker sonda a fila a cada `CLICKUP_WORKER_POLL_MS`, padrão 5s) e recarregar a página. | O badge muda para "sincronizado" (ícone de link externo, badge `secondary`), clicável.                     |
| 4 | Clicar no badge.                                                                                  | Abre a tarefa "Aceitação 011 — Criação" no ClickUp: responsável = o membro vinculado; status = o status "em andamento" configurado; 1 comentário com data/tempo em negrito e a descrição em texto simples logo abaixo. |

- **Resultado obtido:** ⬜ Passou · ⬜ Falhou
- **Observações / evidências:**

---

#### CT-02 — Segundo ponto na mesma sprint reaproveita a tarefa

- **Objetivo:** confirmar que um ponto com o mesmo título, na mesma sprint, não duplica
  a tarefa — só acrescenta comentário.
- **Referências:** _CA-02; RN-01_
- **Pré-condição:** a tarefa "Aceitação 011 — Criação" já existe (resultado do CT-01),
  ainda na sprint atual.

| # | Passo                                                                 | Resultado esperado                                                                 |
| - | ------------------------------------------------------------------------ | --------------------------------------------------------------------------------------- |
| 1 | Lançar um novo ponto com título **exatamente igual** ("Aceitação 011 — Criação"), mesmo projeto, dia de hoje. | Ponto criado, badge "sincronizando".                                                     |
| 2 | Aguardar o worker e recarregar.                                       | Badge vira "sincronizado", apontando para **a mesma URL de tarefa** do CT-01.            |
| 3 | Abrir a tarefa no ClickUp.                                            | **Nenhuma tarefa nova** foi criada (confira na Lista); a tarefa agora tem **2 comentários**, um por ponto lançado. |

- **Resultado obtido:** ⬜ Passou · ⬜ Falhou
- **Observações / evidências:**

---

#### CT-03 — Tarefa já existente no ClickUp (criada por outra pessoa) é adotada

- **Objetivo:** confirmar que uma tarefa criada direto no ClickUp, sem ligação prévia
  com o controlbio, é adotada em vez de duplicada.
- **Referências:** _CA-03; RF-03, RF-04, RF-08; RN-01, RN-02_
- **Pré-condição:** no ClickUp, criar manualmente a tarefa "Aceitação 011 — Adoção" na
  sprint atual do Folder configurado, **sem responsável**, no status de backlog/parado
  da Lista (ex.: "to do").

| # | Passo                                                                 | Resultado esperado                                                                 |
| - | ------------------------------------------------------------------------ | --------------------------------------------------------------------------------------- |
| 1 | Lançar um ponto com título "Aceitação 011 — Adoção", mesmo projeto, dia de hoje. | Ponto criado, badge "sincronizando".                                                     |
| 2 | Aguardar o worker e recarregar.                                       | Badge "sincronizado", link aponta para a tarefa criada manualmente.                      |
| 3 | Abrir a tarefa no ClickUp.                                            | **Nenhuma tarefa duplicada**; o funcionário de teste foi **adicionado como responsável**; status mudou para o status "em andamento" configurado; 1 comentário novo com o trabalho lançado. |

- **Resultado obtido:** ⬜ Passou · ⬜ Falhou
- **Observações / evidências:**

---

### Grupo B — Transições de status

#### CT-04 — Tarefa em status "adiante" não é tocada

- **Objetivo:** confirmar que RN-02 (nunca regredir) não mexe em tarefa que já está
  além do status "parado".
- **Referências:** _CA-04; RN-02_
- **Pré-condição:** no ClickUp, mover manualmente uma tarefa vinculada (ex.: a de CT-01)
  para um status **customizado**, além do fluxo simples (ex.: "em teste"/"homologando" —
  qualquer status que não seja um dos dois configurados em `/integracao` para este
  projeto).

| # | Passo                                                                 | Resultado esperado                                                                 |
| - | ------------------------------------------------------------------------ | --------------------------------------------------------------------------------------- |
| 1 | Lançar um novo ponto com o mesmo título dessa tarefa.                  | Ponto criado, badge "sincronizando" → "sincronizado".                                    |
| 2 | Abrir a tarefa no ClickUp.                                             | Status **permanece** o mesmo (ex.: "em teste"); só o comentário novo foi adicionado.      |

- **Resultado obtido:** ⬜ Passou · ⬜ Falhou
- **Observações / evidências:**

---

#### CT-05 — Pausar o cronômetro não altera status da tarefa

- **Objetivo:** confirmar RN-04 — pausa é intervalo, não sinal de conclusão.
- **Referências:** _CA-07; RN-04_
- **Pré-condição:** cronômetro parado; a tarefa "Aceitação 011 — Criação" (CT-01) está
  no status "em andamento".

| # | Passo                                                                 | Resultado esperado                                                                 |
| - | ------------------------------------------------------------------------ | --------------------------------------------------------------------------------------- |
| 1 | Em `/ponto`, no card "Cronômetro", clicar **"Iniciar cronômetro"** com título "Aceitação 011 — Criação" e o projeto configurado. | Cronômetro rodando; botões **"Pausar"** e **"Encerrar"** visíveis.                        |
| 2 | Clicar **"Pausar"**.                                                   | Cronômetro pausado; botão vira **"Retomar"**.                                            |
| 3 | Abrir a tarefa no ClickUp.                                             | Status **não muda** — nenhum job foi gerado por pausar (pausar não cria ponto).           |

- **Resultado obtido:** ⬜ Passou · ⬜ Falhou
- **Observações / evidências:**

---

#### CT-06 — Encerrar com "mover a tarefa para revisão" marcado

- **Objetivo:** confirmar RF-09 — ao encerrar, a tarefa pode ir para o status de
  conclusão configurado.
- **Referências:** _CA-08; RF-09; RN-04_
- **Pré-condição:** cronômetro rodando (ou pausado) com título "Aceitação 011 —
  Criação"; o projeto tem **status "concluído"** configurado em `/integracao` (senão o
  interruptor nem aparece).

| # | Passo                                                                 | Resultado esperado                                                                 |
| - | ------------------------------------------------------------------------ | --------------------------------------------------------------------------------------- |
| 1 | Clicar **"Encerrar"** no card do cronômetro.                           | Abre o modal **"Encerrar cronômetro"**, com um bloco por segmento e o tempo já preenchido. |
| 2 | Conferir que o interruptor **"Mover a tarefa para revisão"** está **marcado por padrão**; preencher a descrição do bloco; clicar **"Salvar ponto"**. | Modal fecha; toast "Ponto criado."; badge do ponto novo "sincronizando".                  |
| 3 | Aguardar o worker e recarregar; abrir a tarefa no ClickUp.             | Status da tarefa mudou para o status "concluído" configurado; comentário do bloco adicionado. |

- **Resultado obtido:** ⬜ Passou · ⬜ Falhou
- **Observações / evidências:**

---

### Grupo C — Carry over entre sprints

#### CT-07 — Atividade que continua acompanha a sprint nova

- **Objetivo:** confirmar RF-17 — a tarefa **migra** de sprint, preservando histórico.
- **Referências:** _CA-05; RF-17; RN-01_
- **Pré-condição:** existe uma tarefa vinculada (ex.: CT-01) numa Lista de sprint
  **anterior** à atual, ainda **não concluída**, com pelo menos um comentário.

| # | Passo                                                                 | Resultado esperado                                                                 |
| - | ------------------------------------------------------------------------ | --------------------------------------------------------------------------------------- |
| 1 | Lançar um ponto com o mesmo título, dia de hoje (que cai na sprint atual). | Ponto criado, badge "sincronizando" → "sincronizado".                                    |
| 2 | Abrir a tarefa no ClickUp.                                             | A tarefa agora está na **Lista da sprint atual** (não mais na anterior); **todos os comentários anteriores continuam lá**, mais o novo. |

- **Resultado obtido:** ⬜ Passou · ⬜ Falhou
- **Observações / evidências:**

---

#### CT-08 — Tarefa concluída na sprint anterior gera tarefa nova

- **Objetivo:** confirmar RN-03 — tarefa concluída não é reaproveitada nem reaberta.
- **Referências:** _CA-06; RN-03_
- **Pré-condição:** no ClickUp, marcar como **concluída** (status `type = done`/`closed`)
  a tarefa vinculada de uma sprint anterior.

| # | Passo                                                                 | Resultado esperado                                                                 |
| - | ------------------------------------------------------------------------ | --------------------------------------------------------------------------------------- |
| 1 | Lançar um ponto com o **mesmo título**, dia de hoje.                   | Ponto criado, badge "sincronizando" → "sincronizado".                                    |
| 2 | Abrir o link do badge.                                                 | Aponta para uma **tarefa nova**, na Lista da sprint atual, em status "em andamento".      |
| 3 | Conferir a tarefa concluída original.                                  | Continua **concluída e intacta**, sem comentário novo, sem reabertura.                    |

- **Resultado obtido:** ⬜ Passou · ⬜ Falhou
- **Observações / evidências:**

---

### Grupo D — O cronômetro (múltiplos segmentos)

#### CT-09 — Encerrar com três segmentos gera três comentários na mesma tarefa

- **Objetivo:** confirmar RN-05 — cada segmento vira um ponto e um comentário próprio.
- **Referências:** _CA-09; RN-05_
- **Pré-condição:** um cronômetro com **3 segmentos** (iniciar/pausar/retomar duas vezes)
  usando o mesmo título de atividade.

| # | Passo                                                                 | Resultado esperado                                                                 |
| - | ------------------------------------------------------------------------ | --------------------------------------------------------------------------------------- |
| 1 | Iniciar o cronômetro, pausar, retomar, pausar, retomar — gerando 3 blocos. Clicar **"Encerrar"**. | Modal "Encerrar cronômetro" mostra **3 blocos** ("Bloco 1", "Bloco 2", "Bloco 3"), cada um com seu horário. |
| 2 | Preencher a descrição de cada bloco (ou usar **"Usar a descrição do 1º bloco em todos"**). Clicar **"Salvar (3 pontos)"**. | Toast "3 pontos criados."; 3 cards novos em `/ponto`, cada um com seu próprio badge de sincronização. |
| 3 | Aguardar o worker e recarregar; abrir a tarefa no ClickUp.             | **Uma única tarefa** recebeu **3 comentários**, um por bloco/ponto — nenhuma tarefa duplicada. |

- **Resultado obtido:** ⬜ Passou · ⬜ Falhou
- **Observações / evidências:**

---

### Grupo E — Falha, indisponibilidade e reenvio

#### CT-10 — ClickUp fora do ar: ponto salvo, enviado sozinho quando volta

- **Objetivo:** confirmar RF-01/15/16 — o ponto nunca depende do ClickUp para ser salvo,
  e falha temporária se recupera sozinha.
- **Referências:** _CA-10; RF-01, RF-15, RF-16_
- **Pré-condição:** conseguir simular indisponibilidade — ex.: `docker compose stop
  worker`, ou trocar temporariamente `CLICKUP_API_TOKEN` por um valor inválido e
  reiniciar o worker.

| # | Passo                                                                 | Resultado esperado                                                                 |
| - | ------------------------------------------------------------------------ | --------------------------------------------------------------------------------------- |
| 1 | Com o worker parado (ou o token trocado), lançar um ponto normalmente via **"Novo registro"**. | Ponto salvo normalmente, sem demora perceptível; badge "sincronizando".                   |
| 2 | Recarregar a página algumas vezes enquanto o worker está fora.         | Badge continua "sincronizando" — nada quebra, nenhuma mensagem de erro na tela do ponto.  |
| 3 | Restaurar o worker (`docker compose start worker` / devolver o token real e reiniciar). Aguardar o próximo ciclo de sondagem e recarregar. | Badge muda para "sincronizado" **sem nenhuma ação manual** da pessoa.                      |

- **Resultado obtido:** ⬜ Passou · ⬜ Falhou
- **Observações / evidências:**

---

#### CT-11 — Falha definitiva mostra motivo e permite reenviar

- **Objetivo:** confirmar RF-13/14 — falha terminal fica visível com motivo e ação de
  reenvio.
- **Referências:** _CA-11; RF-13, RF-14_
- **Pré-condição:** forçar uma falha terminal — ex.: apagar/renomear no ClickUp um
  status usado na configuração do projeto **antes** de lançar o ponto (gera
  `REQUISICAO_INVALIDA` ou equivalente), ou usar um projeto sem configuração válida
  momentaneamente e depois corrigir só a config, deixando o job já `failed`.

| # | Passo                                                                 | Resultado esperado                                                                 |
| - | ------------------------------------------------------------------------ | --------------------------------------------------------------------------------------- |
| 1 | Lançar um ponto nas condições acima e deixar as tentativas automáticas se esgotarem (5 tentativas, ver `spec.md` Q-05) ou provocar um erro terminal (401/403/400) direto. | Após esgotar, o card do ponto mostra o badge **"falhou"** (`destructive`).                |
| 2 | Passar o mouse/tocar no badge de falha.                                | `title` mostra o motivo (ex.: código do erro).                                           |
| 3 | Clicar no botão **"Reenviar"** (ícone de atualizar ao lado do badge).   | Toast "Reenviado para o ClickUp." e o badge volta a "sincronizando".                      |

- **Resultado obtido:** ⬜ Passou · ⬜ Falhou
- **Observações / evidências:**

---

#### CT-12 — Reenvio após falha parcial não duplica nada

- **Objetivo:** confirmar RN-13 — idempotência do reenvio em qualquer etapa do pipeline.
- **Referências:** _CA-12; RN-13_
- **Pré-condição:** um job que falhou **depois** de já ter criado a tarefa (ex.: falha
  simulada na etapa de comentário ou de lançamento de tempo — pode exigir cortar a rede
  do worker no meio de um ciclo, ou usar um token pessoal inválido só para o passo de
  tempo).

| # | Passo                                                                 | Resultado esperado                                                                 |
| - | ------------------------------------------------------------------------ | --------------------------------------------------------------------------------------- |
| 1 | Provocar a falha parcial descrita acima; conferir no ClickUp que a tarefa **já existe**, mas o comentário/lançamento de tempo esperado ainda não. | Ponto com badge "falhou" ou ainda "sincronizando" dependendo do tempo de retry.           |
| 2 | Clicar **"Reenviar"** (ou aguardar o retry automático).                | Job retoma da etapa em que parou.                                                        |
| 3 | Conferir a tarefa no ClickUp.                                          | **Uma só tarefa**, **um só comentário** para este ponto, **um só lançamento de tempo** — nada duplicado. |

- **Resultado obtido:** ⬜ Passou · ⬜ Falhou
- **Observações / evidências:**

---

#### CT-13 — Trinta pontos atrasados de uma vez não erram por limite de requisições

- **Objetivo:** confirmar a RNF de limite externo — a fila degrada em vazão, nunca em
  erro (CA-19).
- **Referências:** _CA-19; RNF limite externo_
- **Pré-condição:** usuário de teste com "Membro do ClickUp" vinculado; disposição para
  criar 30 registros (podem ter títulos distintos ou repetidos, propositalmente
  misturando os dois para também gerar carga em `resolve`).

| # | Passo                                                                 | Resultado esperado                                                                 |
| - | ------------------------------------------------------------------------ | --------------------------------------------------------------------------------------- |
| 1 | Lançar 30 pontos em sequência rápida (script ou repetição manual via **"Novo registro"**/"Duplicar"). | Todos salvos imediatamente, sem erro, todos com badge "sincronizando".                    |
| 2 | Acompanhar `docker compose logs -f worker` enquanto processa.          | Nenhum log de erro `429`; a vazão desacelera perto do teto (`CLICKUP_RATE_LIMIT_PER_MIN`, padrão 90/min), mas não para. |
| 3 | Aguardar o processamento completo (pode levar alguns minutos) e recarregar `/ponto`. | Todos os 30 pontos terminam "sincronizados" (ou com o aviso "sem sprint", se aplicável) — nenhum fica preso em "falhou" por limite de requisições. |

- **Resultado obtido:** ⬜ Passou · ⬜ Falhou
- **Observações / evidências:**

---

### Grupo F — Configuração do admin

#### CT-14 — "Testar" mostra em qual sprint um ponto de hoje cairia

- **Objetivo:** confirmar RF-19 e, de quebra, apurar Q-01 (as Listas do workspace real
  têm data preenchida?).
- **Referências:** _CA-13; RF-19_
- **Pré-condição:** configuração do projeto já **salva** em `/integracao` (o botão
  "Testar" fica desabilitado até isso acontecer).

| # | Passo                                                                 | Resultado esperado                                                                 |
| - | ------------------------------------------------------------------------ | --------------------------------------------------------------------------------------- |
| 1 | Como admin, em `/integracao`, no card do projeto configurado, clicar **"Testar"**. | Mostra um bloco com "Um ponto de hoje iria para a Lista **\<nome\>**" e a origem: "pela data da própria Lista" / "pelo nome da Lista" / "foi para o backlog — sprint não resolvida". |
| 2 | Anotar a origem mostrada.                                              | **Registrar aqui** se veio de `list_date` ou `list_name` — é a resposta prática de Q-01 para este Folder. |
| 3 | Conferir também a seção de status: "Os status configurados existem nessa Lista." (ou a lista de problemas, se algum status não existir na Lista resolvida). | Sem problemas listados quando a configuração está correta.                               |

- **Resultado obtido:** ⬜ Passou · ⬜ Falhou
- **Observações / evidências:** _Origem observada (list_date / list_name / backlog):_ \_\_\_\_

---

#### CT-15 — Projeto sem configuração: ponto salvo, nada enviado, admin vê a pendência

- **Objetivo:** confirmar RN-08.
- **Referências:** _CA-14; RN-08_
- **Pré-condição:** um projeto **sem** configuração salva em `/integracao` (ou com
  "Ativar integração" desmarcado).

| # | Passo                                                                 | Resultado esperado                                                                 |
| - | ------------------------------------------------------------------------ | --------------------------------------------------------------------------------------- |
| 1 | Lançar um ponto nesse projeto.                                         | Ponto salvo normalmente.                                                                 |
| 2 | Aguardar o worker e recarregar `/ponto`.                                | Badge **não** vira "sincronizado" nem some — fica sinalizado como pendência (job `failed` com o código `CONFIG_AUSENTE`, badge "falhou" com opção de reenviar depois de configurado). |
| 3 | Como admin, olhar o cabeçalho "Conexão" em `/integracao`.               | O contador de "envios pendentes com falha" reflete esse job.                             |

- **Resultado obtido:** ⬜ Passou · ⬜ Falhou
- **Observações / evidências:**

---

#### CT-16 — Usuário sem vínculo de membro: nada é criado, admin vê a pendência

- **Objetivo:** confirmar RN-09.
- **Referências:** _CA-15; RN-09_
- **Pré-condição:** um usuário funcionário **sem** "Membro do ClickUp" vinculado
  (`/usuarios` → campo em branco).

| # | Passo                                                                 | Resultado esperado                                                                 |
| - | ------------------------------------------------------------------------ | --------------------------------------------------------------------------------------- |
| 1 | Logado como esse usuário, lançar um ponto num projeto configurado.      | Ponto salvo normalmente.                                                                 |
| 2 | Aguardar o worker e recarregar.                                        | Badge fica "falhou" com o código `SEM_VINCULO`; nenhuma tarefa é criada no ClickUp.       |
| 3 | Como admin, conferir o contador de pendências em `/integracao`.        | Reflete o job falhado.                                                                    |

- **Resultado obtido:** ⬜ Passou · ⬜ Falhou
- **Observações / evidências:**

---

#### CT-17 — Dia sem sprint correspondente vai para o backlog e fica sinalizado

- **Objetivo:** confirmar RF-07 — nunca perder o ponto quando nenhuma sprint casa com a
  data.
- **Referências:** _CA-21; RF-07; RN-01_
- **Pré-condição:** lançar um ponto com um dia trabalhado que **não** cai em nenhuma
  Lista de sprint do Folder configurado (ex.: uma data bem futura ou de um hiato entre
  sprints).

| # | Passo                                                                 | Resultado esperado                                                                 |
| - | ------------------------------------------------------------------------ | --------------------------------------------------------------------------------------- |
| 1 | Lançar o ponto com essa data.                                          | Ponto salvo, badge "sincronizando".                                                      |
| 2 | Aguardar o worker e recarregar.                                        | Badge muda para a variante de aviso **"sem sprint"** (`warning`, ícone de alerta) em vez do badge "sincronizado" comum — mas **é clicável** e leva à tarefa. |
| 3 | Abrir a tarefa.                                                        | Está na **Lista de backlog** configurada para o projeto, não numa sprint.                |

- **Resultado obtido:** ⬜ Passou · ⬜ Falhou
- **Observações / evidências:**

---

### Grupo G — Conta pessoal e lançamento de tempo

#### CT-18 — Conta pessoal conectada: tempo aparece lançado no meu nome

- **Objetivo:** confirmar RF-18/RN-12 (caminho feliz).
- **Referências:** _CA-16; RF-18; RN-12_
- **Pré-condição:** em **Minha conta → ClickUp**, o funcionário de teste conectou um
  token pessoal válido (`pk_...`) — botão **"Conectar"**.

| # | Passo                                                                 | Resultado esperado                                                                 |
| - | ------------------------------------------------------------------------ | --------------------------------------------------------------------------------------- |
| 1 | Confirmar em "Minha conta" que aparece "Conectado como **\<nome\>**".  | Rótulo público visível; o token em si nunca aparece de volta na tela.                    |
| 2 | Lançar um ponto normalmente.                                           | Ponto sincroniza como de costume.                                                        |
| 3 | No ClickUp, abrir a tarefa → aba de tempo rastreado (ou o relatório nativo de tempo do workspace). | O tempo lançado aparece **atribuído ao próprio funcionário** (não ao dono do token de serviço). |

- **Resultado obtido:** ⬜ Passou · ⬜ Falhou
- **Observações / evidências:**

---

#### CT-19 — Sem conta pessoal: sincroniza normalmente, sem lançar tempo, sem erro

- **Objetivo:** confirmar RN-12 — ninguém é bloqueado por não conectar.
- **Referências:** _CA-17; RN-12_
- **Pré-condição:** funcionário de teste **sem** token pessoal conectado (padrão).

| # | Passo                                                                 | Resultado esperado                                                                 |
| - | ------------------------------------------------------------------------ | --------------------------------------------------------------------------------------- |
| 1 | Lançar um ponto normalmente.                                           | Badge vai a "sincronizado" normalmente — sem erro, sem badge "falhou".                    |
| 2 | Abrir a tarefa no ClickUp.                                             | Tarefa e comentário existem normalmente.                                                 |
| 3 | Conferir o rastreamento de tempo da tarefa.                            | **Nenhum tempo lançado** para este ponto — e isso não é tratado como falha em nenhum lugar da UI. |

- **Resultado obtido:** ⬜ Passou · ⬜ Falhou
- **Observações / evidências:**

---

### Grupo H — Edição e exclusão (não destrutivo no ClickUp)

#### CT-20 — Editar ponto sincronizado gera comentário de correção, não reescreve

- **Objetivo:** confirmar RN-06.
- **Referências:** _CA-22; RN-06_
- **Pré-condição:** um ponto já "sincronizado" (ex.: o de CT-01), com o comentário
  original visível na tarefa.

| # | Passo                                                                 | Resultado esperado                                                                 |
| - | ------------------------------------------------------------------------ | --------------------------------------------------------------------------------------- |
| 1 | Em `/ponto`, no card do registro, clicar o ícone **"Editar"**.         | Abre o modal **"Editar registro"** com os dados atuais.                                  |
| 2 | Alterar o tempo trabalhado e/ou a descrição. Clicar **"Salvar alterações"**. | Modal fecha; badge volta a "sincronizando".                                              |
| 3 | Aguardar o worker e recarregar; abrir a tarefa no ClickUp.             | **Novo comentário** começando com "Correção · \<data\> · \<novo tempo\>" (negrito) foi adicionado; o **comentário original permanece intacto**, sem edição. |

- **Resultado obtido:** ⬜ Passou · ⬜ Falhou
- **Observações / evidências:**

---

#### CT-21 — Excluir ponto sincronizado não apaga nada no ClickUp

- **Objetivo:** confirmar RN-07.
- **Referências:** _CA-23; RN-07_
- **Pré-condição:** um ponto já "sincronizado", com tarefa e comentário visíveis no
  ClickUp.

| # | Passo                                                                 | Resultado esperado                                                                 |
| - | ------------------------------------------------------------------------ | --------------------------------------------------------------------------------------- |
| 1 | Anotar a URL da tarefa (abrir o badge antes de excluir).               | —                                                                                         |
| 2 | No card do ponto, clicar o ícone **"Excluir"**, confirmar no modal **"Excluir registro"**. | Ponto removido de `/ponto`.                                                              |
| 3 | Abrir a URL anotada no ClickUp.                                        | A tarefa **continua existindo**, com todos os comentários — nada foi apagado.            |

- **Resultado obtido:** ⬜ Passou · ⬜ Falhou
- **Observações / evidências:**

---

### Grupo I — Permissões

#### CT-22 — Funcionário não acessa a tela de configuração

- **Objetivo:** confirmar a RNF de acesso — configurar é exclusivo do admin.
- **Referências:** _CA-18; RNF acesso_
- **Pré-condição:** logado como usuário com role **funcionário** (não admin).

| # | Passo                                                                 | Resultado esperado                                                                 |
| - | ------------------------------------------------------------------------ | --------------------------------------------------------------------------------------- |
| 1 | Tentar acessar `/integracao` diretamente pela URL.                     | Acesso **negado** (redirecionamento/página de erro, conforme o padrão de `requirePermission` do projeto) — a tela de configuração não é exibida. |
| 2 | Conferir a sidebar.                                                    | O item de navegação para "Integração" **não aparece** para este usuário.                 |

- **Resultado obtido:** ⬜ Passou · ⬜ Falhou
- **Observações / evidências:**

---

### Grupo J — Mobile / responsividade

#### CT-23 — Estado de sincronização utilizável em 360px

- **Objetivo:** confirmar a RNF de responsividade no componente novo desta feature.
- **Referências:** _CA-20; RNF responsividade_
- **Pré-condição:** pelo menos um ponto em cada estado relevante (sincronizando,
  sincronizado, sincronizado sem sprint, falhou) — ou testar um de cada vez.

| # | Passo                                                                 | Resultado esperado                                                                 |
| - | ------------------------------------------------------------------------ | --------------------------------------------------------------------------------------- |
| 1 | Abrir `/ponto` num viewport de **360px de largura** (DevTools → responsivo, ou celular real). | Nenhum scroll horizontal na página.                                                       |
| 2 | Observar o badge de sincronização em cada estado.                     | No mobile, o rótulo de texto ("sincronizado", "sem sprint", "falhou") **some** e sobra só o ícone — sem quebrar o layout do card. |
| 3 | Tocar no badge "sincronizado"/"sem sprint" (link) e no botão "Reenviar" do badge "falhou". | Ambos respondem ao toque com alvo efetivo ≥44px (a área clicável é maior que o ícone visível — ver `TOQUE_ALVO` no componente). |
| 4 | Abrir o modal "Encerrar cronômetro" com o interruptor "Mover a tarefa para revisão" nesse mesmo viewport. | Interruptor e rótulo legíveis, sem overflow, alvo de toque ≥44px.                         |

- **Resultado obtido:** ⬜ Passou · ⬜ Falhou
- **Observações / evidências:**

---

### Grupo K — Infraestrutura do worker (Docker Compose)

> Estes dois casos não têm CA correspondente na spec — validam o `plan.md` §2 (worker
> em container próprio) e a RNF de resiliência diretamente no ambiente de deploy. Ver a
> nota no topo deste documento: só puderam ser lidos no código, não observados em
> execução, porque o ambiente de desenvolvimento é Windows.

#### CT-24 — Smoke test: o worker sobe e se anuncia

- **Objetivo:** confirmar que o serviço `worker` builda e inicia corretamente a partir
  do estágio `tools` do `Dockerfile`.
- **Referências:** _RNF resiliência; `plan.md` §2, §6_
- **Pré-condição:** `.env` com `CLICKUP_API_TOKEN`/`CLICKUP_TEAM_ID` preenchidos.

| # | Passo                                                                 | Resultado esperado                                                                 |
| - | ------------------------------------------------------------------------ | --------------------------------------------------------------------------------------- |
| 1 | `docker compose up --build worker` (com `db`/`migrate` já ok, ou `docker compose up --build` completo). | Build conclui sem erro; `docker compose ps` mostra `worker` no estado `running`/`Up`.     |
| 2 | `docker compose logs -f worker`.                                       | Aparece a linha `[clickup-worker] iniciado.`, seguida do laço de sondagem (sem erro).     |
| 3 | Remover `CLICKUP_API_TOKEN` do `.env`, `docker compose up -d worker` de novo. | Aparece `[clickup-worker] sem CLICKUP_API_TOKEN/CLICKUP_TEAM_ID — nada a fazer.` e o processo encerra com sucesso (código 0) — como o serviço é `restart: unless-stopped`, ele reinicia e repete a linha periodicamente, sem erro nos logs. |

- **Resultado obtido:** ⬜ Passou · ⬜ Falhou
- **Observações / evidências:**

---

#### CT-25 — Encerramento gracioso ao receber SIGTERM

- **Objetivo:** confirmar que o worker termina o lote em andamento antes de sair, sem
  deixar um job pela metade (o que duplicaria comentário no retry — RN-13).
- **Referências:** _RN-13; RNF resiliência; `plan.md` §2_
- **Pré-condição:** worker rodando com token real e alguns jobs na fila (ex.: os 30 de
  CT-13, para ter uma janela maior de observação).

| # | Passo                                                                 | Resultado esperado                                                                 |
| - | ------------------------------------------------------------------------ | --------------------------------------------------------------------------------------- |
| 1 | Com jobs em processamento, rodar `docker compose kill -s SIGTERM worker`. | Log mostra `[clickup-worker] SIGTERM recebido, encerrando apos o lote atual.`             |
| 2 | Aguardar o processo terminar (`docker compose ps` mostra `worker` parado).| O lote **em andamento no momento do sinal** termina normalmente antes do processo sair — nenhuma etapa é cortada no meio (nenhuma escrita no ClickUp sem o `saveProgress`/`completeJob` correspondente). |
| 3 | Subir o worker de novo (`docker compose start worker`) e conferir os jobs que estavam em andamento. | Nenhum comentário/tarefa/lançamento de tempo duplicado — o pipeline retomou (se algum job ficou pendente) do estágio correto. |

- **Resultado obtido:** ⬜ Passou · ⬜ Falhou
- **Observações / evidências:**

---

## Resumo da Execução

| Caso  | CA relacionado | Status        | Observação |
| ----- | --------------- | ------------- | ---------- |
| CT-01 | CA-01            | ⬜ Pass / Fail |            |
| CT-02 | CA-02            | ⬜ Pass / Fail |            |
| CT-03 | CA-03            | ⬜ Pass / Fail |            |
| CT-04 | CA-04            | ⬜ Pass / Fail |            |
| CT-05 | CA-07            | ⬜ Pass / Fail |            |
| CT-06 | CA-08            | ⬜ Pass / Fail |            |
| CT-07 | CA-05            | ⬜ Pass / Fail |            |
| CT-08 | CA-06            | ⬜ Pass / Fail |            |
| CT-09 | CA-09            | ⬜ Pass / Fail |            |
| CT-10 | CA-10            | ⬜ Pass / Fail |            |
| CT-11 | CA-11            | ⬜ Pass / Fail |            |
| CT-12 | CA-12            | ⬜ Pass / Fail |            |
| CT-13 | CA-19            | ⬜ Pass / Fail |            |
| CT-14 | CA-13            | ⬜ Pass / Fail |            |
| CT-15 | CA-14            | ⬜ Pass / Fail |            |
| CT-16 | CA-15            | ⬜ Pass / Fail |            |
| CT-17 | CA-21            | ⬜ Pass / Fail |            |
| CT-18 | CA-16            | ⬜ Pass / Fail |            |
| CT-19 | CA-17            | ⬜ Pass / Fail |            |
| CT-20 | CA-22            | ⬜ Pass / Fail |            |
| CT-21 | CA-23            | ⬜ Pass / Fail |            |
| CT-22 | CA-18            | ⬜ Pass / Fail |            |
| CT-23 | CA-20            | ⬜ Pass / Fail |            |
| CT-24 | —                | ⬜ Pass / Fail |            |
| CT-25 | —                | ⬜ Pass / Fail |            |

- **Total:** 25 casos (23 rastreados a CA-01…CA-23 + 2 de infraestrutura do worker)
- **Passou:** <Y> · **Falhou:** <Z>
- **Bloqueadores encontrados:** <listar bugs/tickets abertos>
- **Conclusão:** ⬜ Liberado · ⬜ Reprovado · ⬜ Liberado com ressalvas
