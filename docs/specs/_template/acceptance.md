# Testes de Aceitação — <Nome da Feature>

> **Roteiro de testes executados por uma pessoa** (QA/usuário) para aceitar a feature.
> Lista os casos de uso a validar manualmente antes de considerar a feature pronta.
> Cada caso é rastreável aos critérios de aceitação (`spec.md` §9) e às regras de
> negócio (`spec.md` §7).

| Campo         | Valor                              |
| ------------- | ---------------------------------- |
| Versão testada| <ex.: 1.2.0 / commit abc123>       |
| Ambiente      | Local · Homolog · Produção         |
| Testado por   | <nome>                             |
| Data          | <AAAA-MM-DD>                       |

## Pré-condições

> O que precisa estar preparado antes de começar os testes.

- [ ] Ambiente no ar (`docker compose up`).
- [ ] Banco com dados de exemplo (seed): <descrever>.
- [ ] Usuário(s) de teste disponível(is): <ex.: funcionário, gestor>.

---

## Casos de Teste

### CT-01 — <Título do caso de uso>

- **Objetivo:** <o que este teste valida>
- **Referências:** _CA-01, RN-01_
- **Pré-condição:** <estado inicial específico deste caso>

| # | Passo                          | Resultado esperado                   |
| - | ------------------------------ | ------------------------------------ |
| 1 | <ação do usuário>              | <o que o sistema deve mostrar/fazer> |
| 2 | <ação do usuário>              | <resultado>                          |
| 3 | <ação do usuário>              | <resultado>                          |

- **Resultado obtido:** ⬜ Passou · ⬜ Falhou
- **Observações / evidências:** <print, mensagem de erro, link>

---

### CT-02 — <Título — cenário de erro / borda>

- **Objetivo:** <validar tratamento de erro / caso limite>
- **Referências:** _CA-02, RN-02_
- **Pré-condição:** <...>

| # | Passo                          | Resultado esperado                   |
| - | ------------------------------ | ------------------------------------ |
| 1 | <ex.: tentar registrar ponto duplicado no mesmo minuto> | <ex.: sistema bloqueia e exibe mensagem clara> |

- **Resultado obtido:** ⬜ Passou · ⬜ Falhou
- **Observações / evidências:** <...>

---

## Resumo da Execução

| Caso  | Status        | Observação |
| ----- | ------------- | ---------- |
| CT-01 | ⬜ Pass / Fail |            |
| CT-02 | ⬜ Pass / Fail |            |

- **Total:** <X> casos · **Passou:** <Y> · **Falhou:** <Z>
- **Bloqueadores encontrados:** <listar bugs/tickets abertos>
- **Conclusão:** ⬜ Liberado · ⬜ Reprovado · ⬜ Liberado com ressalvas