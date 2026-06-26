# Spec — Minha conta (autoatendimento de perfil)

| Campo         | Valor               |
| ------------- | ------------------- |
| Status        | Aprovada            |
| Autor(es)     | Victor Raphael      |
| Criada em     | 2026-06-26          |
| Atualizada em | 2026-06-26          |

> **Camada 1 — O QUÊ e o PORQUÊ.** Descreve o problema e os requisitos.

## 1. Resumo

Qualquer usuário autenticado (admin **ou** funcionário) pode abrir uma tela
"Minha conta" a partir da própria sidebar e alterar **seus** dados de perfil:
nome, usuário (login), e-mail e senha. Hoje só o admin consegue editar contas, e
sempre as dos outros — o próprio funcionário não tem como trocar a senha ou o
login sem pedir ao admin.

## 2. Problema / Motivação

A edição de usuários (spec 002) é uma ferramenta de administração: exige a
permissão `usuarios:editar`, que só o admin tem, e vive na página `/usuarios`
(invisível para o funcionário). Resultado: um funcionário que queira trocar a
própria senha (vazou, esqueceu, quer uma mais forte) ou ajustar o login depende
do admin. Isso é fricção desnecessária e um risco de segurança (senha não pode
ser girada pela própria pessoa). Todo usuário precisa de um autoatendimento
mínimo do próprio perfil.

## 3. Objetivos

- Permitir que **todo** usuário autenticado edite o próprio nome, usuário,
  e-mail e senha, sem depender do admin.
- Ponto de entrada óbvio e sempre acessível: um botão na sidebar (avatar + nome),
  disponível no mobile (drawer) e no desktop (inclusive recolhida).
- Reaproveitar os padrões existentes (Modal próprio, RHF + Zod, Server Action,
  validação/normalização de username da spec 004).

### Fora de escopo

- Alterar **papel** (role) ou **valor/hora**: continuam exclusivos do admin em
  `/usuarios` (um usuário não promove a si mesmo nem mexe na própria remuneração).
- Confirmar a alteração com a **senha atual** ou reautenticação (decisão do
  produto: sessão válida basta — ver RN-04).
- Desativar/excluir a própria conta, upload de foto de avatar, 2FA,
  recuperação de senha por e-mail ("esqueci a senha" no login).

## 4. Personas / Atores

| Ator        | Descrição                                                        |
| ----------- | ---------------------------------------------------------------- |
| Funcionário | Bate o próprio ponto; quer trocar a própria senha/login/e-mail.  |
| Admin       | Também é um usuário; pode usar "Minha conta" para o próprio perfil (a gestão dos demais segue em `/usuarios`). |

## 5. User Stories

- Como **funcionário**, quero **trocar minha senha** sozinho, para **manter
  minha conta segura sem depender do admin**.
- Como **funcionário**, quero **corrigir meu nome/login/e-mail**, para que **meus
  dados fiquem certos e meu login seja fácil de lembrar**.
- Como **qualquer usuário**, quero **acessar isso de um lugar óbvio na sidebar**,
  para **não precisar procurar**.

## 6. Requisitos Funcionais

| ID    | Requisito                                                                                          | Prioridade |
| ----- | -------------------------------------------------------------------------------------------------- | ---------- |
| RF-01 | A sidebar deve exibir um controle de conta (avatar + nome) que abre a tela "Minha conta".          | Must       |
| RF-02 | O controle deve estar acessível para todos os papéis, no mobile (drawer) e no desktop (aberta/rail).| Must       |
| RF-03 | "Minha conta" deve permitir editar nome, usuário (login), e-mail e senha do **próprio** usuário.   | Must       |
| RF-04 | A senha é opcional na edição: em branco mantém a atual; preenchida, troca.                         | Must       |
| RF-05 | A validação (client e servidor) deve reusar as regras de nome/username/e-mail/senha já existentes. | Must       |
| RF-06 | Ao salvar com sucesso, o nome exibido na sidebar deve refletir a alteração sem recarregar a página.| Should     |

## 7. Regras de Negócio

- **RN-01:** A ação de salvar opera **sempre** sobre o usuário da sessão atual; o
  identificador do alvo nunca vem do client. Não é possível editar outra conta por aqui.
- **RN-02:** Não altera **papel** nem **valor/hora** — esses campos não existem
  nesta tela e o servidor os ignora.
- **RN-03:** `username` e `email` são únicos no sistema; a alteração deve
  rejeitar valores já usados por **outro** usuário (o próprio é ignorado na checagem).
- **RN-04:** Basta a **sessão válida** — não se exige a senha atual para confirmar.
- **RN-05:** A troca de login **não** invalida a sessão atual (a sessão é por
  token, não por username); o usuário continua logado.
- **RN-06:** O `username` segue a normalização da spec 004 (minúsculas, sem
  acento, `a-z0-9`, mín. 2 caracteres). A senha, quando informada, ≥ 8 caracteres.

## 8. Requisitos Não-Funcionais

- **Segurança:** servidor revalida o schema (Zod) e a unicidade; nunca confia no
  client. Senha é gravada como hash `scrypt` (mesmo `hashPassword` do auth).
- **Acessibilidade:** alvo de toque ≥ 44px no controle da sidebar; modal com
  trap de foco/Esc (componente `Modal` existente); rótulos e `aria-invalid`.
- **Responsividade:** mobile first — bottom sheet no celular, centralizado em `sm:`.

## 9. Critérios de Aceitação

- [ ] **CA-01:** Dado um funcionário logado, quando abre a sidebar, então vê um
      controle com avatar + seu nome que abre "Minha conta".
- [ ] **CA-02:** Dado o modal aberto, quando troca a senha por uma válida (≥ 8) e
      salva, então a sessão segue ativa e o próximo login exige a nova senha.
- [ ] **CA-03:** Dado o modal aberto, quando deixa a senha em branco e salva
      outros campos, então a senha **não** muda.
- [ ] **CA-04:** Dado que digito um usuário já usado por outra pessoa, quando
      salvo, então recebo erro inline no campo "usuário" e nada é alterado.
- [ ] **CA-05:** Dado que altero meu nome e salvo, então o nome exibido na
      sidebar atualiza sem recarregar a página.
- [ ] **CA-06:** Não há, em "Minha conta", campo de papel nem de valor/hora; e um
      request forjado com esses campos não os altera.
- [ ] **CA-07:** A tela funciona de ~360px até desktop, e na sidebar recolhida
      (rail) o controle aparece como avatar com tooltip.

## 10. Questões em Aberto

- (resolvido) Campos editáveis → nome, usuário, e-mail e senha.
- (resolvido) Exigir senha atual → não.

## 11. Referências

- `docs/specs/002-usuarios/` — gestão de usuários (admin).
- `docs/specs/004-login-por-nome/` — normalização de username.
- `docs/design-system.md` §6 (Modal), §9 (Sidebar).
- `CLAUDE.md` §6 (estado), §7 (formulários).