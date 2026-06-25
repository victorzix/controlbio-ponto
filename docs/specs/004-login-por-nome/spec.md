# Spec — Login por primeiro nome

| Campo         | Valor                                  |
| ------------- | -------------------------------------- |
| Status        | Aprovada                               |
| Autor(es)     | Victor Raphael                         |
| Criada em     | 2026-06-25                             |
| Atualizada em | 2026-06-25                             |

> **Camada 1 — O QUÊ e o PORQUÊ.** Descreve o problema e os requisitos.
> Modifica o identificador de login definido na spec [`001-autenticacao`](../001-autenticacao/spec.md).

## 1. Resumo

Hoje o login é feito por **e-mail**. Esta feature troca o identificador de acesso para um
**usuário (username) derivado do primeiro nome** da pessoa — sempre normalizado para minúsculas
e sem acentos. Ex.: "Victor Raphael" → `victor`; "AndReY Hartung" → `andrey`. O e-mail deixa de
ser obrigatório e não é mais usado para autenticar.

## 2. Problema / Motivação

O ponto é batido no celular, por quem está na operação. Digitar um e-mail completo em teclado de
toque é lento e propenso a erro. Boa parte do quadro não tem (ou não lembra) um e-mail corporativo.
Um login curto, previsível e tolerante a maiúsculas/acentos reduz o atrito do acesso diário.

## 3. Objetivos

- Permitir login com um **usuário curto** baseado no primeiro nome, sem depender de e-mail.
- Tornar o login **tolerante**: qualquer combinação de maiúsculas/minúsculas e acentos resolve para
  o mesmo usuário (`Andrey`, `ANDREY`, `andrey`, `Andréy` → `andrey`).
- Garantir **unicidade** do usuário mesmo quando dois funcionários têm o mesmo primeiro nome.

### Fora de escopo

- Recuperação de senha / "esqueci minha senha".
- Autenticação por e-mail ou por outros provedores (SSO).
- Alterar a duração de sessão, RBAC ou o fluxo de logout (continuam como na spec 001).

## 4. Personas / Atores

| Ator        | Descrição                                                          |
| ----------- | ------------------------------------------------------------------ |
| Funcionário | Faz login pelo celular com o próprio usuário para registrar ponto. |
| Admin       | Cadastra usuários e define/ajusta o login de cada um.              |

## 5. User Stories

- Como **funcionário**, quero entrar digitando só meu primeiro nome (sem me preocupar com
  maiúsculas ou acentos), para acessar o sistema rápido no celular.
- Como **admin**, quero que o login seja sugerido automaticamente a partir do nome ao cadastrar,
  para não ter que inventar identificadores.
- Como **admin**, quero ser avisado quando o login sugerido já existe, para escolher um alternativo.

## 6. Requisitos Funcionais

| ID    | Requisito                                                                                          | Prioridade |
| ----- | -------------------------------------------------------------------------------------------------- | ---------- |
| RF-01 | A tela de login deve pedir **usuário** e **senha** (não mais e-mail).                              | Must       |
| RF-02 | O usuário digitado deve ser **normalizado** antes da busca (minúsculas, sem acentos, só `a-z0-9`). | Must       |
| RF-03 | No cadastro, o sistema deve **sugerir** o usuário a partir do primeiro nome, permitindo edição.    | Must       |
| RF-04 | O usuário deve ser **único** no sistema; cadastro/edição com usuário repetido deve ser rejeitado.  | Must       |
| RF-05 | O e-mail passa a ser **opcional** no cadastro e não é usado para login.                            | Must       |
| RF-06 | A listagem e a busca de usuários devem exibir/considerar o usuário (login).                        | Should     |

## 7. Regras de Negócio

- **RN-01:** O **identificador de login é o `username`**, não o e-mail. (Substitui o RN-07 da spec 001.)
- **RN-02:** Normalização do username = primeiro token do nome → `normalize("NFD")` removendo
  diacríticos → minúsculas → remoção de tudo que não seja `a-z0-9`. A mesma normalização vale para
  o texto digitado no login.
- **RN-03:** `username` é **único** (case-insensitive por construção, pois já é minúsculo).
- **RN-04:** Se a derivação automática colidir com um usuário existente, o admin **deve escolher**
  outro username manualmente (o sistema não inventa sufixos).
- **RN-05:** `username` não pode ser vazio após normalização (nome só com símbolos/acentos isolados
  é inválido).
- **RN-06:** E-mail é opcional; quando informado continua **único** e normalizado (trim + minúsculas).
- **RN-07:** A mensagem de erro de login continua **genérica** ("Usuário ou senha inválidos."),
  sem revelar se o usuário existe (mantém o espírito do RN-03 da spec 001).

## 8. Requisitos Não-Funcionais

- **Segurança:** mantêm-se hash scrypt, sessão no servidor e proteção contra enumeração por timing
  (verificação dummy quando o usuário não existe) — ver spec 001.
- **Usabilidade (mobile):** campo de usuário com teclado de texto simples, sem autocorreção
  agressiva, alvo de toque ≥ 44px.

## 9. Critérios de Aceitação

- [ ] **CA-01:** Dado um usuário cujo nome é "Victor Raphael", quando o admin o cadastra, então o
      login sugerido é `victor`.
- [ ] **CA-02:** Dado o login `andrey`, quando o funcionário digita `ANDREY`, `Andrey` ou `Andréy`
      com a senha correta, então ele autentica normalmente.
- [ ] **CA-03:** Dado que já existe o usuário `victor`, quando o admin tenta cadastrar outro com
      username `victor`, então o cadastro é rejeitado com aviso para escolher outro.
- [ ] **CA-04:** Dado um cadastro sem e-mail, quando o admin salva, então o usuário é criado e
      consegue logar pelo username.
- [ ] **CA-05:** Dado um login inexistente, quando alguém tenta entrar, então a resposta é a
      mensagem genérica, sem indicar se o usuário existe.

## 10. Questões em Aberto

- [x] (resolvido) Colisão de primeiro nome → coluna `username` única, admin escolhe alternativo.
- [x] (resolvido) E-mail → mantido como opcional.
- [x] (resolvido) Acentos → removidos na normalização.

## 11. Referências

- Spec [`001-autenticacao`](../001-autenticacao/spec.md) — fluxo de autenticação base.
- Spec [`002-usuarios`](../002-usuarios/spec.md) — CRUD de usuários.