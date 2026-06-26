# Acceptance — Minha conta

| Campo         | Valor      |
| ------------- | ---------- |
| Status        | A validar  |
| Atualizada em | 2026-06-26 |

> **Camada 5 — VALIDAÇÃO HUMANA.** Roteiro de testes manuais, rastreável aos CAs da `spec.md`.

## Pré-condições

- Ambiente rodando (`npm run dev`, Postgres no ar).
- Existir ao menos um usuário **funcionário** e um **admin** (ver `db:seed`).

## Casos

### AC-01 — Acesso pela sidebar (CA-01, CA-07, RF-01/02)
1. Logar como funcionário. No mobile (≈360px), tocar ☰ → o rodapé do drawer mostra
   **avatar + nome**; tocar abre o modal "Minha conta".
2. No desktop, mesmo controle no rodapé. Recolher a sidebar (rail): o controle vira
   só o avatar com tooltip "Minha conta"; clicar ainda abre o modal.
   - ✅ Esperado: ponto de entrada visível e funcional em todos os casos.

### AC-02 — Trocar a senha (CA-02)
1. Abrir "Minha conta", preencher **Nova senha** com algo válido (≥ 8) e Salvar.
2. Conferir que a sessão **continua ativa** (não deslogou).
3. Sair e logar de novo: senha antiga falha, senha nova funciona.
   - ✅ Esperado: senha trocada; sessão preservada.

### AC-03 — Senha em branco mantém a atual (CA-03)
1. Abrir "Minha conta", deixar **Nova senha** em branco, mudar o nome e Salvar.
2. Sair e logar com a senha **antiga**.
   - ✅ Esperado: login com a senha antiga funciona (senha não mudou).

### AC-04 — Usuário duplicado (CA-04)
1. Abrir "Minha conta" e tentar usar um **login já usado por outra pessoa**. Salvar.
   - ✅ Esperado: erro inline no campo "Usuário"; nada é alterado.

### AC-05 — Nome reflete na sidebar sem recarregar (CA-05, RF-06)
1. Alterar o **nome** e Salvar.
   - ✅ Esperado: o nome e as iniciais do avatar na sidebar atualizam na hora
     (sem refresh manual da página).

### AC-06 — Sem papel/valor; servidor ignora (CA-06, RN-01/02)
1. Conferir que o modal **não** tem campo de papel nem de valor/hora.
2. (Opcional, técnico) Forjar um request à action com `role`/`hourlyRate`/`id` de
   outro usuário.
   - ✅ Esperado: papel/valor inalterados; alteração aplicada só na própria conta.

## Resultado

- [ ] Todos os casos acima passaram.
- Observações: