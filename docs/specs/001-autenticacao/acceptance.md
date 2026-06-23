# Testes de Aceitação — Autenticação

> **Roteiro de testes executados por uma pessoa** (QA/usuário) para aceitar a feature.
> Cada caso é rastreável aos critérios de aceitação (`spec.md` §9) e às regras de negócio (`spec.md` §7).

| Campo          | Valor                        |
| -------------- | ---------------------------- |
| Versão testada | <commit / tag>               |
| Ambiente       | Local · Homolog · Produção   |
| Testado por    | <nome>                       |
| Data           | <AAAA-MM-DD>                 |

## Pré-condições

- [ ] Ambiente no ar (`docker compose up -d db` + `npm run dev`).
- [ ] Migrations aplicadas (`npm run db:migrate`), incluindo a tabela `sessions`.
- [ ] Seed executado: existe um **admin ativo** (`SEED_ADMIN_EMAIL`/`SEED_ADMIN_PASSWORD`).
- [ ] Existe um usuário **inativo** para o CT-03 (criar via seed/studio: `active = false`).
- [ ] Navegador limpo (sem cookie de sessão prévio).

---

## Casos de Teste

### CT-01 — Login com credenciais válidas
- **Objetivo:** autenticar um usuário ativo. · **Referências:** _CA-01, RN-07_
- **Pré-condição:** admin ativo conhecido.

| # | Passo                                              | Resultado esperado                                   |
| - | -------------------------------------------------- | ---------------------------------------------------- |
| 1 | Abrir `/login`                                     | Tela de login carrega (Card, campos e botão).        |
| 2 | Digitar e-mail (com MAIÚSCULAS/espaços) e a senha  | Campos aceitam a entrada.                            |
| 3 | Clicar em **Entrar**                               | Botão entra em estado "enviando".                    |
| 4 | Aguardar                                           | Redireciona para a área interna; sessão estabelecida.|

- **Resultado obtido:** ⬜ Passou · ⬜ Falhou — **Obs.:**

### CT-02 — Credenciais inválidas (e-mail inexistente e senha errada)
- **Objetivo:** negar acesso sem revelar existência da conta. · **Referências:** _CA-02, RN-03_

| # | Passo                                         | Resultado esperado                                   |
| - | --------------------------------------------- | ---------------------------------------------------- |
| 1 | Logar com e-mail inexistente                  | Erro **genérico** "E-mail ou senha inválidos."       |
| 2 | Logar com e-mail válido + senha errada        | **Mesma** mensagem genérica; segue deslogado.        |

- **Resultado obtido:** ⬜ Passou · ⬜ Falhou — **Obs.:**

### CT-03 — Conta inativa
- **Objetivo:** impedir login de conta desativada. · **Referências:** _CA-03, RN-02_
- **Pré-condição:** usuário com `active = false` e senha conhecida.

| # | Passo                                   | Resultado esperado                              |
| - | --------------------------------------- | ----------------------------------------------- |
| 1 | Logar com o usuário inativo (senha ok)  | Acesso negado com a mensagem genérica.          |

- **Resultado obtido:** ⬜ Passou · ⬜ Falhou — **Obs.:**

### CT-04 — Persistência da sessão
- **Objetivo:** manter login entre recargas/navegação. · **Referências:** _CA-04, RF-03_
- **Pré-condição:** sessão ativa (após CT-01).

| # | Passo                                   | Resultado esperado                              |
| - | --------------------------------------- | ----------------------------------------------- |
| 1 | Recarregar (F5) uma tela interna        | Continua autenticado, sem pedir login.          |
| 2 | Navegar entre telas internas            | Permanece autenticado.                          |

- **Resultado obtido:** ⬜ Passou · ⬜ Falhou — **Obs.:**

### CT-05 — Proteção de rota (anônimo)
- **Objetivo:** barrar acesso anônimo a telas internas. · **Referências:** _CA-05, RF-06, RF-08_
- **Pré-condição:** navegador sem sessão (ou após CT-06).

| # | Passo                                          | Resultado esperado                                        |
| - | ---------------------------------------------- | --------------------------------------------------------- |
| 1 | Acessar diretamente a URL de uma tela interna  | Redireciona para `/login` (com `redirectTo` da rota).     |
| 2 | Logar em seguida                               | Volta para a tela que tentou acessar (RF-08).             |

- **Resultado obtido:** ⬜ Passou · ⬜ Falhou — **Obs.:**

### CT-06 — Logout
- **Objetivo:** encerrar a sessão no servidor. · **Referências:** _CA-06, RN-05_
- **Pré-condição:** sessão ativa.

| # | Passo                                   | Resultado esperado                                   |
| - | --------------------------------------- | ---------------------------------------------------- |
| 1 | Acionar **Sair**                        | Redireciona para `/login`.                           |
| 2 | Tentar acessar tela interna (voltar/URL)| Tratado como anônimo → `/login` (sessão invalidada). |

- **Resultado obtido:** ⬜ Passou · ⬜ Falhou — **Obs.:**

### CT-07 — Mobile first (viewport ~360px)
- **Objetivo:** validar usabilidade no celular. · **Referências:** _CA-07, RF-10_
- **Pré-condição:** DevTools em ~360px de largura (ou celular real).

| # | Passo                                   | Resultado esperado                                              |
| - | --------------------------------------- | --------------------------------------------------------------- |
| 1 | Abrir `/login` a ~360px                 | Sem scroll horizontal; Card e campos legíveis.                  |
| 2 | Tocar campos e botão                    | Alvos confortáveis (≥44px); botão full-width.                   |
| 3 | Enviar com erro                         | Mensagem visível sem quebrar o layout.                          |

- **Resultado obtido:** ⬜ Passou · ⬜ Falhou — **Obs.:**

### CT-08 — Sessão expirada
- **Objetivo:** expirar após o tempo máximo. · **Referências:** _CA-08, RN-04_
- **Pré-condição:** forçar expiração (ajustar `expires_at` no banco para o passado, ou `SESSION_MAX_AGE` curto em ambiente de teste).

| # | Passo                                   | Resultado esperado                              |
| - | --------------------------------------- | ----------------------------------------------- |
| 1 | Com sessão expirada, navegar            | Tratado como anônimo → redireciona a `/login`.  |

- **Resultado obtido:** ⬜ Passou · ⬜ Falhou — **Obs.:**

---

## Resumo da Execução

| Caso  | Status         | Observação |
| ----- | -------------- | ---------- |
| CT-01 | ⬜ Pass / Fail |            |
| CT-02 | ⬜ Pass / Fail |            |
| CT-03 | ⬜ Pass / Fail |            |
| CT-04 | ⬜ Pass / Fail |            |
| CT-05 | ⬜ Pass / Fail |            |
| CT-06 | ⬜ Pass / Fail |            |
| CT-07 | ⬜ Pass / Fail |            |
| CT-08 | ⬜ Pass / Fail |            |

- **Total:** 8 casos · **Passou:** <Y> · **Falhou:** <Z>
- **Bloqueadores encontrados:** <listar>
- **Conclusão:** ⬜ Liberado · ⬜ Reprovado · ⬜ Liberado com ressalvas