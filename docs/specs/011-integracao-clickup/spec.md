# Spec — Integração com ClickUp

| Campo         | Valor                      |
| ------------- | -------------------------- |
| Status        | Em revisão                 |
| Autor(es)     | Victor · Equipe controlbio |
| Criada em     | 2026-09-02                 |
| Atualizada em | 2026-09-02                 |

> **Camada 1 — O QUÊ e o PORQUÊ.** Este documento descreve o problema e os requisitos.
> Evite falar de tecnologia, banco de dados ou implementação (isso vai no `plan.md` e `design.md`).

## 1. Resumo

Todo registro de ponto passa a **se refletir automaticamente no ClickUp**. O título do
ponto vira uma **tarefa na sprint correspondente**, atribuída a quem lançou; o tempo
trabalhado e a descrição entram como **comentário** nessa tarefa. Quando a mesma
atividade recebe pontos em dias diferentes, ela **reaproveita a mesma tarefa** em vez de
duplicar. O andamento acompanha o trabalho: tarefa parada que recebe ponto vai para
_em andamento_; ao **encerrar** o cronômetro, a pessoa pode mandá-la para o status de
_conclusão_. O envio é **assíncrono** — o ponto nunca depende do ClickUp para ser salvo.

## 2. Problema / Motivação

Hoje o controlbio e o ClickUp são dois mundos desconectados. Quem trabalha registra a
hora no controlbio (specs 003 e 010) e, para o trabalho aparecer no board da sprint,
precisa **repetir a informação à mão no ClickUp**: criar ou achar a tarefa, se atribuir,
mover o status, escrever o que foi feito.

Esse lançamento duplo custa caro:

- **É esquecido.** Na prática o board fica desatualizado e a gestão perde a visão de sprint.
- **Divergem.** O que está no ponto e o que está no ClickUp deixam de bater, e ninguém
  sabe qual dos dois está certo.
- **Duplica tarefa.** Sem uma regra clara, a mesma atividade ganha uma tarefa por dia
  trabalhado, poluindo o board.
- **É retrabalho puro.** A informação já foi digitada uma vez, com título, tempo e
  descrição — não há motivo para digitar de novo.

O campo de link opcional em `registros_ponto` (spec 003) já é um sintoma disso: existe
justamente porque hoje a amarração com a tarefa do ClickUp é manual.

## 3. Objetivos

- **Acabar com o lançamento duplo:** quem registra ponto no controlbio não precisa mais
  tocar no ClickUp para o trabalho aparecer no board.
- **Uma tarefa por atividade, não por dia:** pontos com o mesmo título na mesma sprint
  convergem para a mesma tarefa.
- **Reaproveitar o que já existe:** se a tarefa já foi criada no ClickUp (por outra
  pessoa, no planejamento da sprint), o ponto adota aquela tarefa em vez de duplicar.
- **Board sempre refletindo o andamento real,** sem ninguém arrastando card.
- **Configuração no controle do admin:** ele decide qual área do ClickUp recebe cada
  projeto, e isso vale para todos os usuários daquele projeto.
- **Nunca bloquear o ponto:** indisponibilidade ou erro do ClickUp não impede ninguém de
  registrar a própria hora.

### Fora de escopo

- **Sentido inverso (ClickUp → ponto).** Nada que acontece no ClickUp cria, altera ou
  apaga registro de ponto. Não haverá recebimento de eventos do ClickUp nesta versão.
- **Espelhar o status da tarefa de volta no controlbio.** O ponto não exibe nem guarda o
  status atual da tarefa.
- **Mexer na estimativa de tempo da tarefa.** O controlbio nunca escreve estimativa —
  quem estima é quem planeja a sprint, no ClickUp.
- **Criar ou reorganizar sprints.** O sistema escolhe entre as sprints existentes; não
  cria sprint, folder nem espaço.
- **Apagar conteúdo no ClickUp.** Excluir ponto não apaga tarefa nem comentário.
- **Ponto de terceiro.** Continua valendo a spec 007: admin **vê** ponto de equipe, mas
  não lança por outra pessoa — logo, não sincroniza em nome de outra pessoa.
- **Migrar o histórico.** Registros de ponto anteriores à feature não são enviados
  retroativamente.
- **Projetos cadastráveis pela tela.** `dw` e `labphase` seguem sendo os projetos
  existentes; adicionar projeto novo continua sendo mudança de código.

## 4. Personas / Atores

| Ator             | Descrição                                                                                                                                                       |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Funcionário**  | Registra o próprio ponto (manual ou por cronômetro). Quer que o trabalho apareça na sprint sem ter que duplicar o lançamento no ClickUp.                         |
| **Admin**        | Configura qual área do ClickUp recebe cada projeto e quais status usar. Vincula cada usuário ao respectivo membro do ClickUp. Acompanha falhas de sincronização.  |
| **Gestor/Scrum** | Não usa o controlbio. Consome o resultado: board da sprint atualizado, com responsável, andamento e o histórico do que foi feito.                                |

## 5. User Stories

- Como **funcionário**, quero que meu registro de ponto apareça como tarefa na sprint,
  para não ter que lançar a mesma coisa duas vezes.
- Como **funcionário**, quero que os pontos da mesma atividade caiam na mesma tarefa,
  para o board não encher de tarefa repetida.
- Como **funcionário**, quero que uma tarefa que já existe na sprint seja adotada e
  atribuída a mim, para não criar duplicata do que o time já planejou.
- Como **funcionário**, quero que a tarefa vá para _em andamento_ quando eu começo a
  trabalhar nela, para o time ver o andamento sem eu avisar.
- Como **funcionário**, quero mandar a tarefa para revisão ao **encerrar** o cronômetro,
  para sinalizar que terminei — e que **pausar** não faça isso, porque pausa é intervalo.
- Como **funcionário**, quero registrar meu ponto mesmo com o ClickUp fora do ar, para
  não ficar refém de um sistema de terceiro.
- Como **funcionário**, quero ver se meu ponto já chegou no ClickUp e reenviar quando
  falhar, para não descobrir tarde que o board está furado.
- Como **funcionário**, quero opcionalmente conectar minha conta do ClickUp, para as
  horas aparecerem no meu nome também no relatório nativo de lá.
- Como **admin**, quero definir qual área do ClickUp recebe cada projeto, para que valha
  igual para toda a equipe daquele projeto.
- Como **admin**, quero testar a configuração antes de liberar, para não descobrir o erro
  depois que os pontos já foram para o lugar errado.
- Como **admin**, quero ver os envios que falharam e por quê, para corrigir a causa.

## 6. Requisitos Funcionais

| ID    | Requisito                                                                                                                                | Prioridade |
| ----- | ---------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| RF-01 | Ao salvar um registro de ponto, o sistema deve enviá-lo ao ClickUp **sem que a pessoa espere** pela resposta do ClickUp.                  | Must       |
| RF-02 | O sistema deve **criar** uma tarefa quando não existir tarefa com o mesmo título na sprint de destino.                                    | Must       |
| RF-03 | O sistema deve **reaproveitar** a tarefa existente com o mesmo título — inclusive uma criada direto no ClickUp por outra pessoa.           | Must       |
| RF-04 | A tarefa resultante deve ficar **atribuída** a quem lançou o ponto (adicionando-o como responsável, se ainda não for).                     | Must       |
| RF-05 | Cada registro de ponto deve gerar um **comentário** na tarefa com o dia trabalhado, o tempo e a descrição do ponto.                       | Must       |
| RF-06 | O sistema deve escolher a **sprint de destino** a partir do dia trabalhado do ponto.                                                       | Must       |
| RF-07 | Quando nenhuma sprint corresponder ao dia, o ponto deve ir para o **destino de reserva** (backlog) configurado, e ficar sinalizado.        | Must       |
| RF-08 | Tarefa em status **parado** que recebe um ponto deve ir para o status de **andamento** configurado.                                        | Must       |
| RF-09 | Ao **encerrar** o cronômetro, a pessoa deve poder mandar a tarefa para o status de **conclusão** configurado.                              | Must       |
| RF-10 | O admin deve poder configurar, **por projeto**, a área de destino, o destino de reserva e os status de andamento e conclusão.              | Must       |
| RF-11 | A configuração do admin deve valer para **todos os usuários** que lançarem ponto naquele projeto.                                          | Must       |
| RF-12 | O admin deve poder **vincular** cada usuário do controlbio ao respectivo membro do ClickUp, com sugestão automática por nome/e-mail.        | Must       |
| RF-13 | O registro de ponto deve **exibir o estado da sincronização** (pendente, sincronizado, falhou) e dar acesso à tarefa quando sincronizado.   | Must       |
| RF-14 | O usuário deve poder **reenviar manualmente** um ponto cuja sincronização falhou.                                                           | Must       |
| RF-15 | Falha ou indisponibilidade do ClickUp **não pode impedir** o registro do ponto.                                                            | Must       |
| RF-16 | Falha temporária deve ser **reenviada automaticamente**, sem ação humana.                                                                   | Must       |
| RF-17 | Quando a mesma atividade continua em uma **sprint nova**, a tarefa deve acompanhar a sprint atual (carry over).                             | Should     |
| RF-18 | Cada pessoa deve poder **conectar a própria conta** do ClickUp para que o tempo seja lançado em seu nome.                                   | Should     |
| RF-19 | O admin deve poder **testar** a configuração de um projeto e ver em qual sprint um ponto de hoje cairia.                                    | Should     |
| RF-20 | O admin deve poder **desativar** a integração de um projeto sem perder a configuração.                                                      | Could      |

## 7. Regras de Negócio

- **RN-01 (identidade da atividade):** duas atividades são **a mesma** quando têm o
  **mesmo título normalizado** (minúsculo, sem acento, espaços colapsados) dentro do
  **mesmo projeto**. Não há amarração por link nem seleção manual de tarefa. A sprint é
  **atributo da tarefa**, não parte da identidade: quando a atividade continua na sprint
  seguinte, a tarefa **acompanha** (RF-17) em vez de nascer outra. A exceção é RN-03 —
  tarefa concluída encerra aquela identidade e o próximo ponto começa uma tarefa nova.
- **RN-02 (nunca regredir):** o sistema só move para _andamento_ tarefa que esteja em
  status **parado** — entendido como o status que o próprio ClickUp classifica como
  **não iniciado** (ex.: _backlog_, _pausado_, _suspenso_). Qualquer outro status é
  considerado **adiante** (ex.: _em teste_, _homologando_, _em produção_) e a tarefa
  **não é tocada**.
- **RN-03 (tarefa encerrada não volta):** tarefa em status **concluído/cancelado** não é
  reaproveitada nem movida — nesse caso o ponto **cria uma tarefa nova** na sprint atual.
- **RN-04 (pausa não é fim):** **pausar** o cronômetro não altera status de tarefa.
  Somente **encerrar** pode levar a tarefa ao status de conclusão.
- **RN-05 (um segmento, um comentário):** cada segmento do cronômetro vira um registro de
  ponto (spec 010) e, portanto, um **comentário próprio** na mesma tarefa.
- **RN-06 (edição não reescreve histórico):** editar um ponto já sincronizado gera um
  **novo comentário de correção**; o comentário original não é alterado.
- **RN-07 (exclusão não é destrutiva no ClickUp):** excluir um ponto **não apaga** tarefa
  nem comentário no ClickUp; apenas cancela o envio se ainda estiver pendente.
- **RN-08 (sem configuração, sem envio):** ponto de projeto sem configuração válida **não
  é enviado**. Fica sinalizado como pendente de configuração e visível ao admin.
- **RN-09 (sem vínculo, sem tarefa):** usuário sem vínculo com um membro do ClickUp **não
  gera tarefa** — criar tarefa sem responsável poluiria o board de outras pessoas. Fica
  sinalizado ao admin.
- **RN-10 (estimativa é intocada):** o sistema **nunca** escreve a estimativa de tempo da
  tarefa.
- **RN-11 (o ponto é a fonte da verdade):** em qualquer divergência, vale o controlbio.
  O relatório de horas oficial (spec 006) permanece o do controlbio.
- **RN-12 (conta pessoal é opcional):** sem conta conectada, o ponto sincroniza
  normalmente (tarefa + comentário) e apenas **não** lança tempo no relatório nativo do
  ClickUp. Ninguém é bloqueado por não conectar.
- **RN-13 (sem duplicidade em reenvio):** reenviar ou reprocessar um ponto **não pode**
  duplicar tarefa, comentário nem lançamento de tempo.
- **RN-14 (só o próprio ponto):** o sistema só sincroniza ponto do próprio usuário
  autenticado. Não existe sincronização em nome de terceiro.

## 8. Requisitos Não-Funcionais

- **Desempenho:** salvar um ponto **não depende** da resposta do ClickUp — o tempo de
  resposta do formulário permanece o de hoje (< 500 ms) independentemente do estado da
  integração.
- **Resiliência:** indisponibilidade do ClickUp não pode causar **perda** de registro nem
  **duplicidade** ao reprocessar. O envio precisa sobreviver a reinício da aplicação.
- **Limite externo:** o plano do workspace permite **~100 requisições por minuto**, e cada
  ponto consome várias. O envio deve respeitar esse teto e degradar em vazão (fila mais
  lenta), nunca em erro — inclusive quando alguém lançar um mês de pontos atrasados de
  uma vez.
- **Segurança:** a credencial pessoal do ClickUp é **segredo de terceiro**: cifrada em
  repouso, nunca devolvida ao navegador, nunca registrada em log. A credencial de serviço
  vive apenas na configuração do servidor.
- **Privacidade / LGPD:** a **descrição do ponto vai para o ClickUp**, onde outras pessoas
  do workspace podem lê-la. Isso deve estar explícito para quem lança, na própria tela.
- **Observabilidade:** o admin precisa conseguir responder "por que este ponto não chegou
  lá?" sem acesso a log de servidor.
- **Acesso:** configurar a integração é exclusivo do papel **admin** (RBAC em código,
  conforme `src/lib/rbac.ts`). Conectar a própria conta é de qualquer usuário.
- **Responsividade:** todas as telas novas seguem mobile first (≥ 360 px), alvos de toque
  ≥ 44 px, conforme regra §4 do `CLAUDE.md`.

## 9. Critérios de Aceitação

- [ ] **CA-01:** Dado que **não existe** tarefa "Criar Acessos" na sprint atual do projeto,
      quando eu lanço um ponto com esse título, então é criada uma tarefa "Criar Acessos"
      **atribuída a mim**, em **andamento**, com um comentário contendo o dia, o tempo
      trabalhado e a descrição.
- [ ] **CA-02:** Dado que a tarefa "Criar Acessos" **já existe naquela sprint** por causa de
      um ponto anterior meu, quando eu lanço outro ponto com o mesmo título, então
      **nenhuma tarefa nova é criada** e um **novo comentário** aparece na tarefa existente.
- [ ] **CA-03:** Dado que "Criar Acessos" **já existia no ClickUp**, criada por outra pessoa e
      parada no backlog, quando eu lanço um ponto com esse título, então **eu sou adicionado
      como responsável** e a tarefa vai para **andamento** — sem duplicar.
- [ ] **CA-04:** Dado que a tarefa está em um status **adiante** (ex.: em teste), quando eu
      lanço um novo ponto nela, então o **status não muda** e o comentário é adicionado.
- [ ] **CA-05:** Dado que a atividade continuou e a sprint **virou**, quando eu lanço um ponto
      com o mesmo título, então a tarefa é **movida para a sprint atual** preservando o
      histórico de comentários.
- [ ] **CA-06:** Dado que a tarefa da sprint anterior está **concluída**, quando eu lanço um
      ponto com o mesmo título, então uma **tarefa nova** é criada na sprint atual e a
      concluída não é tocada.
- [ ] **CA-07:** Dado que estou com o cronômetro rodando, quando eu **pauso**, então o status
      da tarefa **não muda**.
- [ ] **CA-08:** Dado que eu **encerro** o cronômetro com a opção de revisão marcada, então a
      tarefa vai para o **status de conclusão** configurado do projeto.
- [ ] **CA-09:** Dado que eu encerro o cronômetro com **três segmentos**, então são criados
      três registros de ponto e **três comentários** na mesma tarefa.
- [ ] **CA-10:** Dado que o ClickUp está **fora do ar**, quando eu lanço um ponto, então o
      ponto é **salvo normalmente**, aparece como **pendente**, e é enviado **sozinho**
      quando o ClickUp voltar — sem eu fazer nada.
- [ ] **CA-11:** Dado que o envio falhou de forma **definitiva**, então o registro mostra o
      estado de falha com o motivo e me oferece **reenviar**.
- [ ] **CA-12:** Dado que um ponto foi reenviado depois de uma falha parcial, então **não
      existe** tarefa, comentário nem lançamento de tempo duplicado.
- [ ] **CA-13:** Dado que sou admin, quando eu configuro um projeto e uso **testar**, então
      vejo em qual sprint um ponto de **hoje** cairia, antes de liberar a integração.
- [ ] **CA-14:** Dado que o projeto do meu ponto **não tem configuração**, quando eu lanço o
      ponto, então ele é salvo, **nada é criado** no ClickUp e o admin vê essa pendência.
- [ ] **CA-15:** Dado que meu usuário **não está vinculado** a um membro do ClickUp, quando eu
      lanço um ponto, então **nada é criado** no ClickUp e o admin vê essa pendência.
- [ ] **CA-16:** Dado que eu **conectei** minha conta do ClickUp, quando um ponto meu
      sincroniza, então o tempo aparece lançado **no meu nome** no ClickUp.
- [ ] **CA-17:** Dado que eu **não conectei** conta nenhuma, quando um ponto meu sincroniza,
      então tarefa e comentário são criados normalmente e **nenhum tempo** é lançado — sem
      erro e sem me bloquear.
- [ ] **CA-18:** Dado que sou **funcionário** (não admin), quando eu tento acessar a tela de
      configuração da integração, então o acesso é **negado**.
- [ ] **CA-19:** Dado que eu lanço **30 pontos atrasados de uma vez**, então todos chegam ao
      ClickUp sem erro de limite de requisições, ainda que levem mais tempo.
- [ ] **CA-20:** Dado que a tela de lançamento de ponto está aberta em um viewport de
      **360 px**, então o estado de sincronização e o acesso à tarefa são utilizáveis, sem
      scroll horizontal.
- [ ] **CA-21:** Dado que o dia trabalhado **não cai em nenhuma sprint** do projeto, quando
      eu lanço o ponto, então a tarefa é criada no **destino de reserva** configurado e o
      registro fica **sinalizado** como "sprint não resolvida" — nada é perdido.
- [ ] **CA-22:** Dado que eu **edito** um ponto já sincronizado, então um **novo comentário
      de correção** aparece na tarefa e o comentário original **permanece intacto**.
- [ ] **CA-23:** Dado que eu **excluo** um ponto já sincronizado, então a tarefa e os
      comentários **continuam existindo** no ClickUp.

## 10. Questões em Aberto

- [ ] **Q-01:** As Listas de sprint no ClickUp têm data de início/fim preenchidas? Se não
      tiverem, a escolha da sprint passa a depender do **nome** da Lista — e os nomes hoje
      usam formatos diferentes por frente (`1/9/26 - 15/9/26` em uma, `7/8 - 7/28` em
      outra, e algumas **sem data alguma**, como `Sprint 3 - Abril`). Precisa ser
      verificado com credencial real antes do `design.md`. **Alternativa recomendada:**
      passar a preencher a data das Listas no ClickUp (uma vez por sprint) e tratar o
      parse de nome apenas como rede de segurança.
- [ ] **Q-02:** Qual área do ClickUp corresponde a **`labphase`** e a **`dw`**? Nenhuma
      das duas existe hoje como folder no workspace inspecionado (que tem `GPA`, `AFA`,
      `RPA`, `Produtividade & IA`, `NPS`, `Tech Garage`). Precisam ser criadas ou mapeadas
      para folders existentes.
- [ ] **Q-03:** O status **"waiting code review"** não existe nos folders inspecionados
      (`GPA` tem _em teste_ / _em homologação_; `RPA` tem _homologando_ / _documentando_).
      Ele será criado nos folders de destino, ou o status de conclusão será outro?
- [ ] **Q-04:** O interruptor "mover a tarefa para revisão" no encerramento do cronômetro
      deve vir **marcado por padrão**? A proposta é sim, para honrar "ao encerrar", mas com
      possibilidade de desmarcar — evita marcar como pronta uma tarefa que só foi
      interrompida no fim do dia.
- [ ] **Q-05:** Quantas tentativas automáticas antes de desistir e exigir reenvio manual?
      Proposta: **5**, com intervalos crescentes até algumas horas.
- [ ] **Q-06:** O admin deve ser **notificado** ativamente de falhas (e-mail/alerta) ou
      basta o indicador na tela de integração? Proposta: apenas a tela nesta versão.

## 11. Referências

- **Especificações relacionadas:** `003-registro-de-ponto` (o registro e o campo de link),
  `010-tracking-de-tempo` (cronômetro, segmentos, encerrar vs. pausar),
  `006-relatorios` (o relatório de horas permanece o do controlbio),
  `002-usuarios` (onde entra o vínculo com o membro do ClickUp),
  `007-ponto-equipe` (admin vê, mas não lança por outra pessoa).
- **Regras do projeto:** `CLAUDE.md` (§4 mobile first, §5 design system, §6 estado,
  §7 formulários), `docs/design-system.md`.
- **Documentação da API do ClickUp:**
  - Índice geral: https://developer.clickup.com/llms.txt
  - Autenticação: https://developer.clickup.com/docs/authentication
  - Limites de requisição: https://developer.clickup.com/docs/rate-limits
  - Criar tarefa: https://developer.clickup.com/reference/createtask
  - Lançar tempo: https://developer.clickup.com/reference/createatimeentry
  - Mover tarefa entre Listas: https://developer.clickup.com/docs/move-a-task-to-a-new-list
- **Restrição de plano apurada:** lançar tempo **em nome de outra pessoa** requer plano
  Business Plus ou Enterprise, e o workspace atual está em plano inferior. Daí a decisão
  de conta pessoal opcional (RN-12) — um membro comum sempre pode lançar tempo para si
  mesmo, em qualquer plano.
