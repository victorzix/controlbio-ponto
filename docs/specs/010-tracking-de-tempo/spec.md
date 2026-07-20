# Spec — Tracking de Tempo (Cronômetro de Ponto)

| Campo         | Valor                                  |
| ------------- | -------------------------------------- |
| Status        | Aprovada (implementação inicial concluída) |
| Autor(es)     | Victor · Equipe controlbio             |
| Criada em     | 2026-07-20                             |
| Atualizada em | 2026-07-20                             |

> **Camada 1 — O QUÊ e o PORQUÊ.** Descreve o problema e os requisitos. Sem tecnologia
> nem implementação (isso vai no `plan.md` / `design.md`).

## 1. Resumo

Um **cronômetro de ponto** que a pessoa inicia na hora, informando **apenas título e projeto**.
A contagem vive **no servidor** (baseada em quando começou e quando terminou cada trecho), salva como
**rascunho** — então o tempo continua correndo mesmo se a pessoa atualizar a página, trocar de tela,
fechar a aba ou **sair da conta**. Enquanto ativo, dá para **pausar/retomar** e **ajustar a hora de
início**. Cada trecho entre um _play_ e o _pause_ seguinte é um **segmento** (que vira um ponto próprio —
"como duplicar o ponto"). Ao **encerrar** (stop), abre um **modal** que lista todos os segmentos com o
tempo já preenchido e **tudo editável** (inclusive a descrição, uma para todos ou individual); ao salvar,
cada segmento vira um **registro de ponto** de fato. O cronômetro fica **na própria tela `/ponto`**; ao
sair dela, um **card flutuante fixo** no rodapé mostra título + tempo com botões de **pause** e **stop**.

## 2. Problema / Motivação

Hoje o ponto (spec 003) é **lançamento retroativo**: a pessoa termina a atividade e depois **estima e
digita** quanto trabalhou. Isso depende de memória, é impreciso e chato de fazer no fim do dia. Falta uma
forma de **cronometrar em tempo real** enquanto se trabalha — que não se perca ao trocar de tela ou sair
da conta, e que no fim já entregue o lançamento quase pronto (só revisar e descrever). O objetivo é reduzir
atrito e aumentar a precisão dos registros.

## 3. Objetivos

- Iniciar um cronômetro informando **só título e projeto**.
- Contagem **persistida no servidor** (fonte da verdade = os _timestamps_), que **continua correndo** após
  refresh, troca de tela ou logout/login.
- **Um** cronômetro ativo por usuário por vez.
- **Pausar/retomar**; cada trecho é um **segmento** que vira um ponto próprio (mesmo título/projeto).
- **Ajustar a hora de início** enquanto o cronômetro está ativo.
- **Encerrar** abre um modal que lista os segmentos com tempo preenchido e **tudo editável**; salvar cria
  **N pontos** (um por segmento).
- **Card flutuante** de acompanhamento fora da tela `/ponto`.
- Todas as datas/horas consideradas no **fuso de Brasília**.

### Fora de escopo

- **Mais de um cronômetro simultâneo** por usuário.
- **Tracking de/para outra pessoa** (equipe): o cronômetro é sempre **próprio**. A visão de equipe do admin
  (spec 007) não é afetada.
- **Relatórios/KPIs específicos de tracking**: os pontos gerados entram na lista/relatórios normais (specs
  003/006). Não há métrica nova de "tempo cronometrado".
- **Editar um segmento depois de virar ponto**: isso passa a ser uma **edição de ponto** comum (spec 003).
- **Integração com relógio de ponto legal / Portaria 671** — este é um cronômetro de produtividade, não um
  registrador eletrônico de jornada.
- **Link de tarefa (ClickUp) no cronômetro** — pode ser adicionado por ponto no modal de finalização, mas
  não é campo do tracking em si.

## 4. Personas / Atores

| Ator           | Descrição                                                                 |
| -------------- | ------------------------------------------------------------------------- |
| Funcionário(a) | Cronometra o próprio trabalho, sobretudo no **celular**. Uso principal.   |
| Admin          | Mesma experiência (cronômetro é sempre próprio; a visão de equipe não usa tracking). |

## 5. User Stories

- Como **usuário**, quero **iniciar um cronômetro** informando só título e projeto, para começar a marcar o
  tempo **na hora**, sem preencher formulário.
- Como **usuário**, quero que a contagem **fique no servidor**, para poder **fechar a aba, trocar de tela ou
  sair da conta** e o tempo continuar correndo.
- Como **usuário**, quero **pausar e retomar**, para separar blocos de trabalho — cada bloco vira um ponto.
- Como **usuário**, quero **ajustar a hora que comecei**, para corrigir quando esqueci de iniciar na hora
  certa.
- Como **usuário**, quero que ao **encerrar** abra um modal com o tempo **já preenchido e editável**, para só
  revisar e descrever antes de salvar.
- Como **usuário**, quero um **card flutuante** quando saio da tela de ponto, para acompanhar e **parar** o
  cronômetro de qualquer lugar do sistema.

## 6. Requisitos Funcionais

| ID    | Requisito                                                                                                        | Prioridade |
| ----- | ---------------------------------------------------------------------------------------------------------------- | ---------- |
| RF-01 | Iniciar um tracking informando **apenas título e projeto**. Os demais dados vêm depois.                          | Must       |
| RF-02 | A contagem é **calculada no servidor** a partir dos _timestamps_ (início/fim de cada segmento) e **persistida**. | Must       |
| RF-03 | O tracking **sobrevive** a refresh, fechamento de aba, troca de tela e **logout/login** — ao voltar reflete o tempo real decorrido. | Must |
| RF-04 | **No máximo um** tracking ativo por usuário por vez.                                                             | Must       |
| RF-05 | **Pausar** o cronômetro (fecha o segmento atual, **sem** abrir modal e **sem** criar ponto).                     | Must       |
| RF-06 | **Retomar** (play) inicia um **novo segmento** do mesmo título/projeto ("duplicar").                             | Must       |
| RF-07 | **Ajustar a hora de início** do segmento em curso enquanto o tracking está ativo.                                | Must       |
| RF-08 | **Encerrar** (stop) fecha o segmento atual e abre um **modal de finalização** listando **todos** os segmentos.   | Must       |
| RF-09 | No modal, cada segmento tem **tempo (h/min) e descrição editáveis**; a descrição pode ser **única para todos** ou **individual por segmento**. Título/projeto editáveis (default do tracking). | Must |
| RF-10 | Ao **salvar** o modal, criar **um registro de ponto por segmento** (mesmo título/projeto) e **apagar** o rascunho. | Must     |
| RF-11 | **Cancelar** o modal **não** cria pontos e **não** apaga o rascunho — o tracking continua (pausado).             | Must       |
| RF-12 | UI do cronômetro **inline na própria tela `/ponto`** (estado ocioso: campos título+projeto+iniciar; estado ativo: relógio + controles). | Must |
| RF-13 | **Card flutuante fixo** no rodapé nas **demais** telas do app, com **título · tempo (h:min)** + **pause/play** + **stop**. Não aparece na `/ponto` (lá é inline). | Must |
| RF-14 | Todas as datas/horas consideradas usam o **fuso de Brasília** (America/Sao_Paulo).                               | Must       |
| RF-15 | Telas **mobile first** e seguindo o **design system**; **feedback** (toasts) de sucesso/erro.                    | Must       |
| RF-16 | Animações (relógio/flutuante) sutis e respeitando `prefers-reduced-motion`.                                      | Should     |

## 7. Regras de Negócio

- **RN-01 (um por vez):** Um usuário tem **no máximo um** tracking (rascunho) por vez. Tentar iniciar outro
  com um já ativo é **bloqueado** com mensagem clara.
- **RN-02 (mínimo para iniciar):** Para iniciar bastam **título** (1–120, texto) e **projeto** (`dw` |
  `labphase`). Tempo, descrição e dia **não** são informados no início.
- **RN-03 (tempo no servidor):** O tempo decorrido é `Σ (fim ?? agora) − início` de cada segmento, calculado
  **no servidor**. O cliente apenas **exibe** (relógio que "anda" localmente a partir do início do segmento
  em curso); **nunca** é fonte da verdade.
- **RN-04 (persistência):** O rascunho e seus segmentos ficam **no banco**. Ao reabrir em qualquer
  dispositivo/sessão, o cronômetro reflete o **tempo real** decorrido (não zera, não "pausa sozinho").
- **RN-05 (estados):** O tracking está **rodando** quando há um segmento **aberto** (fim nulo) e **pausado**
  quando **nenhum** segmento está aberto. Play/pause alternam entre esses estados.
- **RN-06 (pause = fecha segmento, sem modal):** _Pause_ define `fim = agora` no segmento em curso. **Não**
  abre modal e **não** cria ponto — o rascunho continua. _Play_ abre um **novo** segmento (`início = agora`),
  do mesmo título/projeto (é o "duplicar o ponto").
- **RN-07 (ajuste de início):** Enquanto ativo, é possível **mudar a hora de início do segmento em curso**. O
  novo início **não pode ser no futuro**, não pode ser **depois de agora**, e não pode ser **antes do fim do
  segmento anterior** (sem sobreposição). Ajustar recomputa o tempo exibido.
- **RN-08 (stop → modal):** _Stop_ fecha o segmento atual (`fim = agora`, se aberto) e abre o **modal de
  finalização** com **todos** os segmentos e seus tempos.
- **RN-09 (edição no modal):** No modal, cada segmento tem **tempo (horas/minutos)** e **descrição**
  editáveis. A **descrição** pode ser **aplicada a todos** (a partir da primeira preenchida) **ou** editada
  **individualmente**. **Título** e **projeto** são editáveis e valem para todos os pontos gerados. O **dia**
  de cada ponto tem default = a **data do início do segmento** (em Brasília).
- **RN-10 (criação = N pontos, atômica):** Ao salvar, **cada segmento** vira um **`registro_ponto`
  independente** com as **mesmas regras da spec 003** (título 1–120; tempo > 0 e ≤ 24h; descrição 1–5000;
  dia não-futuro; projeto válido; dono = sessão). A criação é **atômica** (tudo ou nada). Concluída, o
  rascunho **e** seus segmentos são **apagados**.
- **RN-11 (arredondamento):** A duração de cada segmento é **arredondada para o minuto mais próximo**; se
  resultar em **0**, vira **1** minuto (nenhum segmento é descartado silenciosamente). O usuário pode ajustar
  ou zerar/remover um segmento no modal antes de salvar.
- **RN-12 (cancelar preserva):** **Cancelar/fechar** o modal de finalização **não** cria pontos e **não**
  apaga o rascunho. O tracking permanece **pausado** e pode ser retomado (novo play) ou encerrado de novo.
- **RN-13 (dono no servidor):** O dono do tracking é **sempre** o usuário da sessão (o servidor define;
  nunca o cliente). Toda leitura/escrita é **escopada por dono**. Não existe tracking de/para outra pessoa.
- **RN-14 (fuso de Brasília):** Todas as datas/horas consideradas usam **America/Sao_Paulo**. O `work_date`
  de cada ponto gerado é a **data (em Brasília) do início** do segmento — inclusive quando o segmento cruza a
  meia-noite (conta na data em que **começou**).
- **RN-15 (permissões):** Iniciar/pausar/retomar/ajustar/encerrar/criar usam **`ponto:registrar`**; ler o
  tracking ativo usa **`ponto:ver_proprio`** (ambos os papéis têm). **Nenhuma permissão nova.**
- **RN-16 (integridade dos segmentos):** Um segmento nunca tem `fim < início`; os segmentos de um mesmo
  tracking **não se sobrepõem** no tempo (o início de um ≥ fim do anterior).

## 8. Requisitos Não-Funcionais

- **Segurança:** dono definido no servidor; operações escopadas por dono (ninguém mexe no tracking de outro,
  mesmo forjando id). Tempo nunca confiado ao cliente (anti-fraude do cronômetro).
- **Confiabilidade:** a contagem é resiliente a queda de conexão/aba — depende só dos _timestamps_ salvos.
- **Acessibilidade & Mobile:** mobile first, alvos de toque ≥ 44px, rótulos/erros associados, sem depender de
  hover; card flutuante não pode cobrir ações essenciais nem gerar scroll horizontal.
- **Desempenho:** ler o tracking ativo é uma consulta leve (1 rascunho + poucos segmentos por usuário).

## 9. Critérios de Aceitação

- [ ] **CA-01:** Iniciar com título + projeto → o cronômetro começa a contar. Sem título → **bloqueado**
      (RN-02).
- [ ] **CA-02:** Iniciar, fechar a aba / sair da conta, voltar depois → o tempo reflete o **real decorrido**
      (não zerou nem pausou sozinho) (RF-03/RN-04).
- [ ] **CA-03:** Com um tracking ativo, tentar iniciar outro → **bloqueado** com mensagem (RN-01).
- [ ] **CA-04:** _Pause_ → o relógio **congela**, **nenhum** modal abre e **nenhum** ponto é criado; _play_
      → volta a contar (novo segmento) (RN-06).
- [ ] **CA-05:** Ajustar a hora de início para 30 min antes → o tempo exibido **aumenta ~30 min**; tentar
      hora **no futuro** → recusado (RN-07).
- [ ] **CA-06:** _play_ 40 min → _pause_ → _play_ 25 min → _stop_ → o modal lista **2 segmentos** (≈40 e
      ≈25 min), ambos editáveis (RN-08/RN-09).
- [ ] **CA-07:** No modal, definir **uma** descrição para todos → os pontos saem com a **mesma** descrição;
      editar individualmente → cada ponto com a **sua** (RN-09).
- [ ] **CA-08:** **Salvar** → surgem **2 pontos** (mesmo título/projeto) na lista de `/ponto`; o rascunho
      some e o cronômetro **encerra** (RN-10).
- [ ] **CA-09:** **Cancelar** o modal → **nenhum** ponto criado; o tracking continua **pausado** e pode ser
      retomado/encerrado (RN-12).
- [ ] **CA-10:** Sair da `/ponto` com tracking ativo → aparece o **card flutuante** (título · tempo, pause,
      stop); na `/ponto` o card **não** aparece (UI é inline) (RF-12/RF-13).
- [ ] **CA-11:** Tudo utilizável em **~360px** (RF-15).
- [ ] **CA-12:** Segmento iniciado às **23:50** e encerrado **00:20** do dia seguinte → o ponto fica no dia
      em que **começou** (Brasília) e com ~30 min (RN-14).
- [ ] **CA-13:** O tracking é sempre **próprio**; um usuário não lê/afeta o tracking de outro (id forjado não
      tem efeito) (RN-13).
- [ ] **CA-14:** Um segmento de poucos segundos vira **1 min** (não some sozinho), e pode ser ajustado no
      modal (RN-11).

## 10. Questões em Aberto

- [ ] **Ajuste de início:** por ora, só o **segmento em curso** é ajustável ao vivo (os demais só no modal
      final). Precisamos ajustar segmentos anteriores em tempo real? (assumido: **não**).
- [x] (resolvido) **Contador:** o painel inline mostra **dois** relógios — **bloco atual** (grande,
      `HH:MM:SS`) e **total** (menor, `HH:MM:SS`). O flutuante mostra o total (`HH:MM:SS`).
- [x] (resolvido) **Ajuste de início por texto:** clicar no relógio abre um popover com **input de texto**
      (`HH:MM` ou `2340`) + **data opcional** (default = dia do início) — sem datepicker/datetime-local.
- [ ] **Remover segmento no modal:** permitir excluir um segmento antes de salvar (ex.: pausa acidental)?
      (assumido: **sim**, zerar/remover; um segmento removido não gera ponto).
- [ ] **Descartar tracking:** haverá uma ação de **descartar** o rascunho inteiro sem gerar ponto?
      (assumido: **sim**, com confirmação — ação destrutiva).

## 11. Referências

- `CLAUDE.md` §1 (SDD) · §2 (shadcn) · §3 (motion) · §4 (mobile first) · §5 (design system) · §6 (React
  Query + Zustand) · §7 (RHF + Zod).
- **Spec 003** `docs/specs/003-registro-de-ponto/` — modelo de dados e regras do `registro_ponto` (reusadas
  na finalização). **Spec 007** — visão de equipe (não afetada). **Spec 009** — "duplicar registro"
  (analogia do _pause_).
- `src/db/schema.ts` (`registros_ponto`, enum `project`) · `src/lib/ponto/{actions,data,validation,dates}.ts`
  · `src/app/(app)/ponto/ponto-view.tsx` (SPA React Query) · `src/app/(app)/layout.tsx` (onde mora o card
  flutuante) · `src/lib/rbac.ts` (`ponto:registrar`, `ponto:ver_proprio`).
- ⚠️ Hoje `todayISODate()` (em `validation.ts`) usa o **fuso do servidor** — esta feature exige helper de
  **Brasília** (ver RN-14); tratar no `design.md`.
```
