# Spec — Registro de Ponto

| Campo         | Valor              |
| ------------- | ------------------ |
| Status        | Aprovada (em implementação) |
| Autor(es)     | Equipe controlbio  |
| Criada em     | 2026-06-23         |
| Atualizada em | 2026-06-25         |

> **Camada 1 — O QUÊ e o PORQUÊ.**

## 1. Resumo

Permitir que **qualquer usuário** (funcionário ou admin) registre seu ponto do dia: um **título**, o
**tempo trabalhado** (horas e minutos), o **dia** e uma **descrição** (rich text) do que foi feito. Cada
pessoa vê uma **lista dos próprios registros** e pode **editar** e **excluir** os seus. É o coração
operacional do produto.

## 2. Problema / Motivação

O sistema já tem autenticação e gestão de usuários, mas ainda não faz o que se propõe: **registrar
ponto**. As pessoas precisam de um jeito rápido (e mobile) de lançar quanto trabalharam num dia e
descrever a atividade, e de conferir seus próprios lançamentos.

## 3. Objetivos

- Qualquer usuário autenticado registra um ponto informando tempo trabalhado, dia e descrição.
- Cada usuário vê a lista dos **seus** registros (mais recentes primeiro).
- A descrição é exibida **formatada** (rich text: negrito, itálico, links, listas).

### Fora de escopo

- **Histórico/relatórios, filtros, agregações, exportação** — não agora.
- **Registros de outras pessoas** (visão de equipe/gestão) — cada um vê só o seu.
- **Ponto por marcação (entrada/saída/batida), geolocalização, biometria** — este registro é um
  lançamento manual de tempo trabalhado, não um relógio de batida.
- **Aprovação/ajuste de ponto por terceiros** — feature futura.

## 4. Personas / Atores

| Ator           | Descrição                                                      |
| -------------- | -------------------------------------------------------------- |
| Funcionário(a) | Registra o próprio ponto e vê seus registros. Uso sobretudo no **celular**. |
| Admin          | Também registra o próprio ponto e vê os seus (mesma experiência). |

## 5. User Stories

- Como **usuário**, quero **registrar quanto trabalhei num dia** (horas e minutos) com uma **descrição**,
  para deixar lançado o que fiz.
- Como **usuário**, quero **formatar a descrição** (negrito, links, listas), para destacar o que importa.
- Como **usuário**, quero **ver a lista dos meus registros**, para conferir o que já lancei.

## 6. Requisitos Funcionais

| ID    | Requisito                                                                                      | Prioridade |
| ----- | ---------------------------------------------------------------------------------------------- | ---------- |
| RF-01 | Registrar um ponto com: **título**, tempo trabalhado (horas + minutos), dia e descrição.       | Must       |
| RF-02 | A descrição aceita **rich text** (negrito, itálico, links, listas) com **preview**.            | Must       |
| RF-03 | Listar os registros **do próprio usuário**, mais recentes primeiro, com a descrição formatada. | Must       |
| RF-04 | Qualquer usuário autenticado (funcionário ou admin) pode registrar e ver os **seus** registros.| Must       |
| RF-05 | Um usuário **nunca** vê, cria, edita ou exclui registros em nome de outro.                      | Must       |
| RF-06 | Telas **mobile first** e seguindo o design system.                                             | Must       |
| RF-07 | Feedback claro de sucesso/erro (toast/mensagem).                                                | Should     |
| RF-08 | **Editar** um registro próprio (todos os campos), com a mesma validação do cadastro.            | Must       |
| RF-09 | **Excluir** um registro próprio, com **confirmação** antes da ação destrutiva.                  | Must       |
| RF-10 | **Replicar** um registro: abre modal já com o **mesmo título** (travado) e a **mesma data** por padrão; o usuário só informa tempo e descrição. | Should |
| RF-11 | Registros de **mesmo título no mesmo dia** aparecem **agrupados** (título + horas totais), em bloco **colapsável** que, ao abrir, mostra cada registro com suas horas. | Should |
| RF-12 | O seletor de **dia** usa um **calendário** (pt-BR), não o input de data cru.                    | Should     |
| RF-13 | Cada registro pode ter um **link opcional** (ex.: tarefa no ClickUp); quando presente, aparece como **botão** que abre o link em nova aba, junto das demais ações. | Should |
| RF-14 | Exibir **KPIs** no topo da lista: **horas feitas** e **valor estimado** (horas × valor/hora), com o valor/hora do usuário como subtítulo. Totais — acompanharão filtros futuros. | Should |
| RF-15 | Na **criação**, se o tempo passar de 24h, **distribuir** automaticamente em vários registros (máx. 24h/dia), um por dia consecutivo a partir do dia escolhido. | Should |
| RF-16 | **Filtrar** a lista por período: **esta semana**, **este mês** ou **intervalo personalizado** (datas livres, podendo cruzar vários meses). Lista **e** KPIs refletem o filtro. | Should |

## 7. Regras de Negócio

- **RN-01:** Tempo trabalhado é informado como **horas (0–24)** e **minutos (0–59)** e guardado como
  total de minutos. O total precisa ser **> 0** e **≤ 24h** (1440 min).
- **RN-02:** O **dia** do registro não pode ser **no futuro**. Default = hoje.
- **RN-03:** A descrição é **obrigatória** (1–5000 caracteres), guardada como **Markdown**.
- **RN-04:** A formatação suportada é um subconjunto seguro de Markdown: **negrito**, **itálico**,
  `código`, **links** (apenas `http`/`https`/`mailto`) e **listas**. Nada de HTML cru.
- **RN-05:** O registro é sempre vinculado ao **usuário autenticado** (servidor define o dono; nunca o
  cliente). Listagem, edição e exclusão **filtram pelo dono** — a operação só atinge linhas do próprio
  usuário, mesmo que um id de outro seja forjado.
- **RN-06:** Pode haver **mais de um registro no mesmo dia** (sem restrição de unicidade por enquanto).
- **RN-07:** O **título** é obrigatório (1–120 caracteres), texto simples.
- **RN-08:** Editar/excluir exigem as permissões `ponto:editar` / `ponto:excluir` (funcionário e admin
  têm); a exclusão pede **confirmação** explícita por ser destrutiva.
- **RN-09:** Replicar **cria um novo registro independente** (apenas copia o título; não vincula ao
  original) e usa `ponto:registrar`.
- **RN-10:** O agrupamento na lista é por **(dia, título)**; as "horas totais" do grupo são a **soma** das
  horas dos registros daquele título no dia. Título com um único registro no dia **não** vira grupo.
- **RN-11:** O **link** é opcional; quando informado precisa ser uma URL **http/https** válida. Só links
  http(s) viram botão clicável (segurança), abertos em nova aba com `rel="noopener noreferrer"`.
- **RN-12:** O **valor estimado** é informativo: `minutos × valor/hora(centavos) ÷ 60`, arredondado a
  centavos. Sem valor/hora no usuário, os KPIs de valor mostram "—". Considera apenas os registros do
  próprio usuário.
- **RN-13:** A **distribuição** (RF-15) cria N registros independentes com o **mesmo** título/descrição/link,
  um por dia consecutivo a partir do dia escolhido (24h/dia; o último recebe o resto). O dia **inicial** não
  pode ser futuro, mas os dias **gerados podem** cair no futuro. Teto de **744h** (31 dias) por criação.
  Aplica-se só à **criação/replicar** — a **edição** continua limitada a 24h (um dia).

## 8. Requisitos Não-Funcionais

- **Segurança:** dono do registro definido no servidor; descrição renderizada **sem** injeção de HTML
  (proteção contra XSS); links com allowlist de esquema.
- **Acessibilidade & Mobile:** mobile first, alvos ≥ 44px, rótulos e erros associados aos campos.
- **Desempenho:** lista pessoal carrega rápido (volume pequeno por usuário).

## 9. Critérios de Aceitação

- [ ] **CA-01:** Usuário registra um ponto válido (ex.: 8h 30min, hoje, descrição) → aparece na sua lista.
- [ ] **CA-02:** Descrição com `**negrito**` e `[link](https://...)` → exibida com negrito e link clicável.
- [ ] **CA-03:** Tempo total 0 (0h 0min) → recusado (RN-01). Minutos 60+ ou horas 25+ → recusado.
- [ ] **CA-04:** Dia no futuro → recusado (RN-02).
- [ ] **CA-05:** Descrição vazia → recusada (RN-03).
- [ ] **CA-06:** Usuário A não vê registros do usuário B; cada lista mostra só os próprios (RF-05).
- [ ] **CA-07:** Admin também consegue registrar e ver os próprios registros (RF-04).
- [ ] **CA-08:** Tentativa de injeção na descrição (ex.: `<script>` ou `[x](javascript:...)`) **não**
      executa nada e não vira link perigoso (RN-04).
- [ ] **CA-09:** Telas utilizáveis em ~360px (RF-06).
- [ ] **CA-10:** Registro sem **título** → recusado (RN-07).
- [ ] **CA-11:** Usuário edita um registro próprio (ex.: muda título e tempo) → a lista reflete a mudança.
- [ ] **CA-12:** Usuário exclui um registro próprio após **confirmar** → some da lista; cancelar não exclui.
- [ ] **CA-13:** Tentar editar/excluir um registro de outro usuário (id forjado) **não** tem efeito (RN-05).
- [ ] **CA-14:** Replicar um registro abre o modal com o título travado e a data do original como padrão;
      ao salvar (tempo + descrição), surge um novo registro com o mesmo título.
- [ ] **CA-15:** Dois+ registros de mesmo título no mesmo dia aparecem agrupados (título + horas totais);
      ao expandir, vê-se cada registro com suas horas. Um único registro no dia continua como card normal.
- [ ] **CA-16:** Registro com link válido mostra um botão que abre o link em **nova aba**; link inválido
      (ou esquema não-http) é recusado no formulário (RN-11).
- [ ] **CA-17:** Criar com 80h em 18/06 gera 4 registros (24h em 18, 19, 20 e 8h em 21) com o mesmo título;
      o formulário avisa antes quantos registros serão criados (RF-15/RN-13).

## 10. Questões em Aberto

- [x] (resolvido) **Editar/excluir** registro próprio — implementado neste ciclo (RF-08/RF-09).
- [ ] **Limite diário** (somar minutos do dia ≤ 24h)? Por ora validamos só por registro.
- [ ] Campos extras (projeto/categoria) — não agora.

## 11. Referências

- `CLAUDE.md` §2/§3/§4/§5 · `docs/design-system.md`
- `src/lib/rbac.ts` — `ponto:registrar`, `ponto:ver_proprio` (admin e funcionário possuem).
- `src/lib/auth/guard.ts` — `requirePermission`. `src/db/schema.ts` — nova tabela `registros_ponto`.
