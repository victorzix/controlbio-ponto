# Testes de Aceitação — Tracking de Tempo (Cronômetro de Ponto)

| Campo          | Valor                                        |
| -------------- | -------------------------------------------- |
| Versão testada | branch `main` (implementação inicial spec 010) |
| Ambiente       | Local (`npm run dev` + Postgres do compose)  |
| Testado por    | Claude Code (Playwright MCP) + validação humana pendente |
| Data           | 2026-07-20                                   |

## Pré-condições

- [x] Ambiente no ar (`npm run dev`, Postgres via `docker compose up -d db`).
- [x] Migração `0009_far_fallen_one` aplicada (`npm run db:migrate`).
- [x] Usuário de teste: `admin` / `admin` (com valor/hora definido → R$ 100,00/h).

---

## Casos de Teste

### CT-01 — Iniciar cronômetro (CA-01)
- **Referências:** _CA-01, RN-02_

| # | Passo | Resultado esperado |
| - | ----- | ------------------ |
| 1 | Em `/ponto`, no card **Cronômetro**, preencher Título e escolher Projeto | Campos aceitam entrada |
| 2 | Clicar **Iniciar cronômetro** | Card vira "ativo": título, projeto, "Rodando" e relógio contando (`HH:MM:SS`) |
| 3 | Tentar iniciar sem título | Erro inline "Informe o título." (não inicia) |

- **Resultado:** ✅ Passou (iniciar OK; relógio em `00:00:06`).

### CT-02 — Persistência (CA-02/RN-04)
- **Referências:** _CA-02, RF-03, RN-04_

| # | Passo | Resultado esperado |
| - | ----- | ------------------ |
| 1 | Com o cronômetro rodando, trocar de tela / atualizar / sair e voltar | O tempo reflete o real decorrido (não zera nem pausa sozinho) |

- **Resultado:** ✅ Passou (ao ir para Relatórios o tempo seguiu de `00:00:06` → `00:00:24`).

### CT-03 — Um por vez (CA-03/RN-01)
- **Referências:** _CA-03, RN-01_

| # | Passo | Resultado esperado |
| - | ----- | ------------------ |
| 1 | Com um cronômetro ativo, tentar iniciar outro | Bloqueado: "Você já tem um cronômetro ativo." |

- **Resultado:** ⬜ A validar manualmente (garantido por `UNIQUE(user_id)` + checagem na action).

### CT-04 — Pause/Resume sem modal (CA-04/RN-06)
- **Referências:** _CA-04, RN-06_

| # | Passo | Resultado esperado |
| - | ----- | ------------------ |
| 1 | Clicar **Pausar** (painel ou flutuante) | Relógio congela; rótulo "pausado"; **nenhum** modal; **nenhum** ponto criado |
| 2 | Clicar **Retomar** | Volta a contar (novo segmento) |

- **Resultado:** ✅ Passou (congelou em `00:00:40 · pausado`; retomou; virou 2 blocos).

### CT-05 — Ajustar início via popover de texto (CA-05/RN-07)
- **Referências:** _CA-05, RN-07, RN-16_

| # | Passo | Resultado esperado |
| - | ----- | ------------------ |
| 1 | Com o cronômetro rodando, **clicar no relógio** | Abre o popover "Ajustar início do bloco" (Horário pré-preenchido + Data opcional) |
| 2 | Digitar horário como texto (ex.: `2340`) e Salvar | Aceita `2340`→23:40; o tempo do bloco recalcula |
| 3 | Tentar um início no futuro | Erro "O início não pode ser no futuro." |

- **Resultado:** ⬜ Popover verificado (abre, pré-preenche, fecha no Cancelar); parse coberto por
  `compute.test.ts` (`parseTimeToHM`). Save end-to-end não executado para não alterar um tracking real ativo.

### CT-06 — Encerrar → modal com N blocos (CA-06/RN-08)
- **Referências:** _CA-06, RN-08_

| # | Passo | Resultado esperado |
| - | ----- | ------------------ |
| 1 | Após play→pause→play, clicar **Encerrar** | Abre o modal listando **2 blocos**, cada um com dia, tempo (≈ medido) e descrição |

- **Resultado:** ✅ Passou (modal "Encerrar cronômetro" com Bloco 1 e Bloco 2, 0h 1min cada).

### CT-07 — Descrição única ou individual (CA-07/RN-09)
- **Referências:** _CA-07, RN-09_

| # | Passo | Resultado esperado |
| - | ----- | ------------------ |
| 1 | Preencher a descrição do Bloco 1 → **Usar a descrição do 1º bloco em todos** | Todos os blocos recebem a mesma descrição |
| 2 | Editar a descrição de um bloco isolado | Só aquele bloco muda |

- **Resultado:** ✅ Passou (aplicou "Trabalho na feature X..." aos 2 blocos).

### CT-08 — Salvar cria N pontos (CA-08/RN-10)
- **Referências:** _CA-08, RN-10_

| # | Passo | Resultado esperado |
| - | ----- | ------------------ |
| 1 | Clicar **Salvar (N pontos)** | Cria 1 ponto por bloco (mesmo título/projeto); rascunho some; cronômetro encerra |
| 2 | Ver a lista de `/ponto` | Os pontos aparecem (agrupados por título) e os KPIs somam o tempo |

- **Resultado:** ✅ Passou (2 pontos "Desenvolvimento feature X (2)", KPIs 2min / R$ 3,33).

### CT-09 — Cancelar preserva (CA-09/RN-12)
- **Referências:** _CA-09, RN-12_

| # | Passo | Resultado esperado |
| - | ----- | ------------------ |
| 1 | Abrir o modal e **Cancelar** | Nenhum ponto criado; o cronômetro continua (pausado) e pode retomar/encerrar |

- **Resultado:** ⬜ A validar manualmente.

### CT-10 — Card flutuante (CA-10/RF-13)
- **Referências:** _CA-10, RF-12, RF-13_

| # | Passo | Resultado esperado |
| - | ----- | ------------------ |
| 1 | Com cronômetro ativo, sair da `/ponto` | Card flutuante no rodapé: título · tempo + pause/play + encerrar |
| 2 | Voltar à `/ponto` | O flutuante some (UI é inline) |

- **Resultado:** ✅ Passou (flutuante apareceu em `/` com controles funcionais).

### CT-11 — Brasília / vira meia-noite (CA-12/RN-14)
- **Referências:** _CA-12, RN-14_

| # | Passo | Resultado esperado |
| - | ----- | ------------------ |
| 1 | Bloco iniciado 23:50 e encerrado 00:20 | Ponto no dia em que **começou** (Brasília) |

- **Resultado:** ⬜ Coberto por teste unitário `tz.test.ts`; validação manual opcional.

### CT-12 — Mobile ~360px (CA-11)
- **Resultado:** ⬜ A validar manualmente (layout mobile-first; alvos ≥ 44px).

---

## Resumo da Execução

| Caso  | Status | Observação |
| ----- | ------ | ---------- |
| CT-01 | ✅ Pass | iniciar + validação de título |
| CT-02 | ✅ Pass | tempo persiste ao trocar de tela |
| CT-03 | ⬜ | garantido por UNIQUE + checagem |
| CT-04 | ✅ Pass | pause/resume sem modal |
| CT-05 | ⬜ | implementado; validar manual |
| CT-06 | ✅ Pass | modal com 2 blocos |
| CT-07 | ✅ Pass | descrição p/ todos |
| CT-08 | ✅ Pass | 2 pontos criados |
| CT-09 | ⬜ | validar manual |
| CT-10 | ✅ Pass | flutuante fora da /ponto |
| CT-11 | ⬜ | unit test cobre a regra |
| CT-12 | ⬜ | validar manual |

- **Conclusão:** ⬜ Liberado com ressalvas — fluxo principal verificado via Playwright; itens ⬜ pedem
  passada manual (especialmente ajuste de início, cancelar-preserva e mobile 360px).
