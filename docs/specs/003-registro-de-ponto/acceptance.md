# Testes de Aceitação — Registro de Ponto

> Roteiro manual. Rastreável aos CA (`spec.md` §9) e RN (`spec.md` §7).

| Campo          | Valor                        |
| -------------- | ---------------------------- |
| Versão testada | <commit / tag>               |
| Ambiente       | Local · Homolog · Produção   |
| Testado por    | <nome>                       |
| Data           | <AAAA-MM-DD>                 |

## Pré-condições
- [ ] App no ar e migrations aplicadas (tabela `registros_ponto`).
- [ ] Pelo menos dois usuários (ex.: o admin do seed + um funcionário) para o teste de isolamento (CT-06).

---

### CT-01 — Registrar ponto (CA-01)
| # | Passo | Resultado esperado |
| - | ----- | ------------------ |
| 1 | Abrir `/ponto` → "Novo registro" | Form abre com dia = hoje |
| 2 | Informar 8h 30min, hoje, uma descrição e salvar | Volta a `/ponto`; registro aparece com "8h 30min" e a data |

### CT-02 — Rich text na descrição (CA-02)
| # | Passo | Resultado esperado |
| - | ----- | ------------------ |
| 1 | Na descrição, usar `**negrito**` e `[site](https://controlbio.com.br)` | Preview mostra negrito e link |
| 2 | Salvar e ver na lista | Texto em negrito; link clicável (abre em nova aba) |

### CT-03 — Validação de tempo (CA-03 / RN-01)
| # | Passo | Resultado esperado |
| - | ----- | ------------------ |
| 1 | Tentar salvar com 0h 0min | Recusado: tempo > 0 |
| 2 | Tentar 25h ou 70min | Recusado (faixas inválidas) |

### CT-04 — Dia no futuro (CA-04 / RN-02)
| # | Passo | Resultado esperado |
| - | ----- | ------------------ |
| 1 | Selecionar uma data futura e salvar | Recusado: "O dia não pode ser no futuro." |

### CT-05 — Descrição obrigatória (CA-05 / RN-03)
| # | Passo | Resultado esperado |
| - | ----- | ------------------ |
| 1 | Salvar com descrição vazia | Recusado: "Informe a descrição." |

### CT-06 — Isolamento por usuário (CA-06 / RF-05)
| # | Passo | Resultado esperado |
| - | ----- | ------------------ |
| 1 | Usuário A cria um registro | Aparece na lista de A |
| 2 | Logar como usuário B e abrir `/ponto` | **Não** vê o registro de A; vê só os próprios |

### CT-07 — Admin registra (CA-07 / RF-04)
| # | Passo | Resultado esperado |
| - | ----- | ------------------ |
| 1 | Logar como admin, registrar um ponto | Funciona; admin vê seus próprios registros |

### CT-08 — Segurança da descrição (CA-08 / RN-04)
| # | Passo | Resultado esperado |
| - | ----- | ------------------ |
| 1 | Descrição com `<script>alert(1)</script>` | Exibido como **texto literal**; nenhum script executa |
| 2 | Descrição com `[x](javascript:alert(1))` | Renderizado como texto, **não** como link clicável |

### CT-09 — Mobile (CA-09 / RF-06)
| # | Passo | Resultado esperado |
| - | ----- | ------------------ |
| 1 | Abrir lista e form em ~360px | Sem scroll horizontal; campos e editor utilizáveis; alvos ≥ 44px |

---

## Resumo
| Caso | Status | Obs. |
| ---- | ------ | ---- |
| CT-01 | ⬜ | |
| CT-02 | ⬜ | |
| CT-03 | ⬜ | |
| CT-04 | ⬜ | |
| CT-05 | ⬜ | |
| CT-06 | ⬜ | |
| CT-07 | ⬜ | |
| CT-08 | ⬜ | |
| CT-09 | ⬜ | |

- **Total:** 9 · **Passou:** <Y> · **Falhou:** <Z>
- **Conclusão:** ⬜ Liberado ⬜ Reprovado ⬜ Liberado com ressalvas
