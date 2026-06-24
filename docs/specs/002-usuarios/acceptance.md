# Testes de Aceitação — Usuários

> Roteiro manual (QA/usuário). Rastreável aos CA (`spec.md` §9) e RN (`spec.md` §7).

| Campo          | Valor                        |
| -------------- | ---------------------------- |
| Versão testada | <commit / tag>               |
| Ambiente       | Local · Homolog · Produção   |
| Testado por    | <nome>                       |
| Data           | <AAAA-MM-DD>                 |

## Pré-condições
- [ ] App no ar (`docker compose up -d db` + `npm run dev`) e migrations aplicadas.
- [ ] Admin disponível (seed). Útil ter um 2º admin para testar RN-05 sem se trancar.
- [ ] Saber logar como **admin** e como **funcionário** para os testes de RBAC.

---

### CT-01 — Criar usuário (CA-01)
| # | Passo | Resultado esperado |
| - | ----- | ------------------ |
| 1 | Como admin, abrir `/usuarios` → "Novo usuário" | Form de criação abre |
| 2 | Preencher nome/e-mail/papel/senha (≥8) e salvar | Volta à lista; usuário aparece; toast de sucesso |
| 3 | Deslogar e logar com o novo usuário | Login bem-sucedido |
- **Resultado:** ⬜ Passou ⬜ Falhou — **Obs.:**

### CT-02 — E-mail duplicado (CA-02 / RN-01)
| # | Passo | Resultado esperado |
| - | ----- | ------------------ |
| 1 | Criar/editar com e-mail já usado por outro | Bloqueado: "Já existe um usuário com este e-mail." |
- **Resultado:** ⬜ Passou ⬜ Falhou — **Obs.:**

### CT-03 — Senha curta (CA-03 / RN-02)
| # | Passo | Resultado esperado |
| - | ----- | ------------------ |
| 1 | Criar usuário com senha < 8 caracteres | Recusado com mensagem no campo senha |
| 2 | Editar usuário deixando senha em branco | Salva mantendo a senha atual |
- **Resultado:** ⬜ Passou ⬜ Falhou — **Obs.:**

### CT-04 — Editar papel (CA-04)
| # | Passo | Resultado esperado |
| - | ----- | ------------------ |
| 1 | Editar um funcionário → mudar papel para admin → salvar | Lista mostra "Admin" |
| 2 | Logar com ele e acessar `/usuarios` | Consegue gerenciar usuários (agora é admin) |
- **Resultado:** ⬜ Passou ⬜ Falhou — **Obs.:**

### CT-05 — Desativar corta acesso (CA-05 / RF-05 / RN-07)
| # | Passo | Resultado esperado |
| - | ----- | ------------------ |
| 1 | Usuário-alvo logado em outro navegador | Sessão ativa |
| 2 | Admin desativa esse usuário | Status "inativo" na lista |
| 3 | No outro navegador, navegar/recarregar | Levado ao login; novo login **negado** |
- **Resultado:** ⬜ Passou ⬜ Falhou — **Obs.:**

### CT-06 — Reativar (CA-06)
| # | Passo | Resultado esperado |
| - | ----- | ------------------ |
| 1 | Admin reativa o usuário | Status "ativo" |
| 2 | Usuário loga | Login bem-sucedido |
- **Resultado:** ⬜ Passou ⬜ Falhou — **Obs.:**

### CT-07 — Auto-bloqueio impedido (CA-07 / RN-05)
| # | Passo | Resultado esperado |
| - | ----- | ------------------ |
| 1 | Admin abre a própria edição | Campo de papel **desabilitado**; sem botão de desativar a si mesmo |
| 2 | Tentar desativar a própria conta (ex.: via URL/forçado) | Negado pelo servidor |
- **Resultado:** ⬜ Passou ⬜ Falhou — **Obs.:**

### CT-08 — Escrita negada para não-admin (CA-08 / RF-06 / RN-08)
| # | Passo | Resultado esperado |
| - | ----- | ------------------ |
| 1 | Logar como funcionário e acessar `/usuarios/novo` por URL direta | Negado/redirecionado (sem permissão) |
| 2 | Forçar uma ação de escrita sem ser admin | Recusada pelo servidor |
- **Resultado:** ⬜ Passou ⬜ Falhou — **Obs.:**

### CT-09 — Funcionário sem acesso (CA-09)
| # | Passo | Resultado esperado |
| - | ----- | ------------------ |
| 1 | Logar como funcionário, acessar `/usuarios` | Redirecionado (sem permissão de leitura) |
- **Resultado:** ⬜ Passou ⬜ Falhou — **Obs.:**

### CT-10 — Mobile (CA-10 / RF-08)
| # | Passo | Resultado esperado |
| - | ----- | ------------------ |
| 1 | Abrir lista e formulário em ~360px | Sem scroll horizontal; cards/forms legíveis; alvos ≥ 44px |
- **Resultado:** ⬜ Passou ⬜ Falhou — **Obs.:**

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
| CT-10 | ⬜ | |

- **Total:** 10 · **Passou:** <Y> · **Falhou:** <Z>
- **Conclusão:** ⬜ Liberado ⬜ Reprovado ⬜ Liberado com ressalvas
