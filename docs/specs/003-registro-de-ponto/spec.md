# Spec — Registro de Ponto

| Campo         | Valor              |
| ------------- | ------------------ |
| Status        | Aprovada (em implementação) |
| Autor(es)     | Equipe controlbio  |
| Criada em     | 2026-06-23         |
| Atualizada em | 2026-06-23         |

> **Camada 1 — O QUÊ e o PORQUÊ.**

## 1. Resumo

Permitir que **qualquer usuário** (funcionário ou admin) registre seu ponto do dia: o **tempo
trabalhado** (horas e minutos), o **dia** e uma **descrição** (rich text) do que foi feito. Cada pessoa
vê uma **lista simples dos próprios registros**. É o coração operacional do produto.

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
- **Editar/excluir** registros — por ora só cadastrar e listar.
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
| RF-01 | Registrar um ponto com: tempo trabalhado (horas + minutos), dia e descrição.                   | Must       |
| RF-02 | A descrição aceita **rich text** (negrito, itálico, links, listas) com **preview**.            | Must       |
| RF-03 | Listar os registros **do próprio usuário**, mais recentes primeiro, com a descrição formatada. | Must       |
| RF-04 | Qualquer usuário autenticado (funcionário ou admin) pode registrar e ver os **seus** registros.| Must       |
| RF-05 | Um usuário **nunca** vê ou cria registros em nome de outro.                                     | Must       |
| RF-06 | Telas **mobile first** e seguindo o design system.                                             | Must       |
| RF-07 | Feedback claro de sucesso/erro (toast/mensagem).                                                | Should     |

## 7. Regras de Negócio

- **RN-01:** Tempo trabalhado é informado como **horas (0–24)** e **minutos (0–59)** e guardado como
  total de minutos. O total precisa ser **> 0** e **≤ 24h** (1440 min).
- **RN-02:** O **dia** do registro não pode ser **no futuro**. Default = hoje.
- **RN-03:** A descrição é **obrigatória** (1–5000 caracteres), guardada como **Markdown**.
- **RN-04:** A formatação suportada é um subconjunto seguro de Markdown: **negrito**, **itálico**,
  `código`, **links** (apenas `http`/`https`/`mailto`) e **listas**. Nada de HTML cru.
- **RN-05:** O registro é sempre vinculado ao **usuário autenticado** (servidor define o dono; nunca o
  cliente). Listagem filtra pelo dono.
- **RN-06:** Pode haver **mais de um registro no mesmo dia** (sem restrição de unicidade por enquanto).

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

## 10. Questões em Aberto

- [ ] **Editar/excluir** registro próprio — provavelmente necessário em breve; fora deste ciclo.
- [ ] **Limite diário** (somar minutos do dia ≤ 24h)? Por ora validamos só por registro.
- [ ] Campos extras (projeto/categoria) — não agora.

## 11. Referências

- `CLAUDE.md` §2/§3/§4/§5 · `docs/design-system.md`
- `src/lib/rbac.ts` — `ponto:registrar`, `ponto:ver_proprio` (admin e funcionário possuem).
- `src/lib/auth/guard.ts` — `requirePermission`. `src/db/schema.ts` — nova tabela `registros_ponto`.
