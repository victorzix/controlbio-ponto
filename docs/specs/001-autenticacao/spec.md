# Spec — Autenticação

| Campo         | Valor              |
| ------------- | ------------------ |
| Status        | Aprovada (em implementação) |
| Autor(es)     | Equipe controlbio  |
| Criada em     | 2026-06-23         |
| Atualizada em | 2026-06-23         |

> **Camada 1 — O QUÊ e o PORQUÊ.** Este documento descreve o problema e os requisitos.
> Evite falar de tecnologia, banco de dados ou implementação (isso vai no `plan.md` e `design.md`).

## 1. Resumo

Permitir que pessoas usuárias do controlbio-ponto **provem quem são** para usar o sistema. Esta
feature entrega o login por e-mail e senha, a manutenção da sessão durante o expediente, o logout
e a proteção das telas internas — a porta de entrada de todo o resto do produto.

## 2. Problema / Motivação

Um sistema de ponto lida com dados sensíveis (jornada de trabalho, vínculo com a empresa) e suas
ações têm peso legal e trabalhista. Sem autenticação, qualquer pessoa poderia registrar ponto no
lugar de outra ou ver registros que não lhe pertencem. **Nada no produto pode existir antes de
sabermos, com segurança, quem está do outro lado.** Por isso a autenticação é a primeira feature.

## 3. Objetivos

- Uma pessoa com credenciais válidas consegue entrar no sistema e permanecer autenticada durante
  o expediente (sessão de 8h).
- Pessoas sem sessão válida **não** acessam nenhuma tela interna — são levadas ao login.
- A pessoa consegue sair do sistema (logout) e, a partir daí, a sessão deixa de valer imediatamente.
- Senhas nunca são armazenadas ou trafegadas em texto puro.
- Uma conta desativada não consegue entrar nem manter sessão.

### Fora de escopo

- **Cadastro/CRUD de usuários** (criar, editar, desativar pessoas) — vai para a spec `002-usuarios`.
  Aqui assumimos que já existe pelo menos um usuário (um admin inicial criado por *seed*).
- **Autocadastro público** (signup aberto). Não haverá. Contas são criadas internamente.
- **Recuperação de senha / "esqueci minha senha"** por e-mail — feature futura.
- **Login social / SSO / 2FA** — fora deste ciclo.
- **Telas e regras de RBAC por papel** além do necessário para proteger a área interna; o RBAC fino
  (quem vê o quê) é exercido pelas features que consomem cada permissão.

## 4. Personas / Atores

| Ator             | Descrição                                                                 |
| ---------------- | ------------------------------------------------------------------------- |
| Funcionário(a)   | Registra o próprio ponto. Acessa quase sempre pelo **celular**.           |
| Admin            | Acesso total. Existe desde o *seed* inicial para configurar o sistema.    |
| Visitante anônimo| Quem ainda não autenticou. Só pode ver a tela de login.                   |

## 5. User Stories

- Como **funcionário(a)**, quero **entrar com meu e-mail e senha no celular**, para **bater meu ponto**.
- Como **pessoa autenticada**, quero **continuar logada durante o expediente**, para **não precisar
  digitar a senha o tempo todo**.
- Como **pessoa autenticada**, quero **sair do sistema**, para **proteger minha conta em um aparelho
  compartilhado**.
- Como **visitante anônimo**, ao tentar abrir uma tela interna, quero **ser levado(a) ao login**,
  para **entender que preciso autenticar**.
- Como **admin**, quero que **contas desativadas não consigam entrar**, para **cortar o acesso de
  quem saiu da empresa**.

## 6. Requisitos Funcionais

| ID    | Requisito                                                                                          | Prioridade |
| ----- | -------------------------------------------------------------------------------------------------- | ---------- |
| RF-01 | O sistema deve oferecer uma tela de login com e-mail e senha.                                      | Must       |
| RF-02 | O sistema deve autenticar a pessoa quando e-mail e senha conferem com uma conta **ativa**.         | Must       |
| RF-03 | O sistema deve criar uma sessão ao autenticar e mantê-la entre requisições/recargas de página.     | Must       |
| RF-04 | O sistema deve recusar o login com credenciais inválidas, **sem revelar** se o e-mail existe.      | Must       |
| RF-05 | O sistema deve permitir logout, encerrando a sessão imediatamente.                                 | Must       |
| RF-06 | O sistema deve redirecionar visitantes anônimos das telas internas para o login.                   | Must       |
| RF-07 | O sistema deve redirecionar quem já está logado para fora da tela de login (para a área interna).   | Should     |
| RF-08 | Após o login, o sistema deve levar a pessoa de volta à página que ela tentava acessar (se houver).  | Should     |
| RF-09 | O sistema deve limitar tentativas de login malsucedidas para dificultar ataques de força bruta.    | Should     |
| RF-10 | A tela de login deve ser **mobile first** e funcionar de ~360px até desktop.                       | Must       |

## 7. Regras de Negócio

- **RN-01:** Senha **nunca** é armazenada em texto puro — apenas seu *hash*. Confirma RF de segurança.
- **RN-02:** Conta com `active = false` **não** autentica e **não** mantém sessão, mesmo com senha correta.
- **RN-03:** Mensagem de erro de login é **genérica** ("e-mail ou senha inválidos"), independentemente
  de o e-mail existir ou não, para não permitir enumeração de usuários.
- **RN-04:** A sessão expira após **8 horas** (`SESSION_MAX_AGE`, alinhado a uma jornada). Após expirar,
  a pessoa precisa logar de novo.
- **RN-05:** O logout invalida a sessão **no servidor** — não basta apagar o cookie do navegador.
- **RN-06:** O cookie de sessão é `HttpOnly`, `SameSite=Lax` e `Secure` (fora de ambiente local), e
  não carrega dados sensíveis (apenas um identificador opaco).
- **RN-07:** E-mail é tratado de forma **case-insensitive** e sem espaços nas pontas no momento do login.

## 8. Requisitos Não-Funcionais

- **Desempenho:** o login deve responder em < 1 s em condições normais; a verificação de sessão em
  navegação interna não deve adicionar latência perceptível (< 100 ms).
- **Segurança / LGPD:** *hashing* de senha com algoritmo moderno e *salt* por usuário; cookies seguros;
  proteção contra enumeração de usuários e força bruta; sessões revogáveis no servidor.
- **Acessibilidade & Mobile:** tela **mobile first**, alvos de toque ≥ 44px, navegável por teclado e
  com rótulos para leitores de tela; respeitar `prefers-reduced-motion` nas animações.
- **Compliance:** base para a rastreabilidade exigida em sistemas de ponto (Portaria 671 do MTE) —
  cada ação de ponto, nas features seguintes, estará amarrada a uma identidade autenticada.

## 9. Critérios de Aceitação

- [ ] **CA-01:** Dado um usuário ativo com senha correta, quando ele envia o formulário de login, então
      é autenticado e levado à área interna.
- [ ] **CA-02:** Dado um e-mail inexistente **ou** uma senha errada, quando a pessoa tenta logar, então
      vê a **mesma** mensagem genérica de erro e permanece deslogada.
- [ ] **CA-03:** Dado um usuário com `active = false`, quando ele tenta logar com a senha correta, então
      o acesso é negado com a mensagem genérica.
- [ ] **CA-04:** Dada uma sessão válida, quando a pessoa recarrega a página ou navega entre telas internas,
      então continua autenticada sem precisar logar de novo.
- [ ] **CA-05:** Dado um visitante anônimo, quando ele acessa a URL de uma tela interna, então é
      redirecionado para o login.
- [ ] **CA-06:** Dada uma pessoa autenticada, quando ela faz logout, então a sessão é invalidada e uma
      nova tentativa de acessar telas internas a leva ao login.
- [ ] **CA-07:** Dado o formulário de login aberto em um viewport de ~360px, então ele é totalmente
      utilizável (campos, botão e mensagens visíveis, sem scroll horizontal, alvos de toque adequados).
- [ ] **CA-08:** Dada uma sessão expirada (passadas 8h), quando a pessoa navega, então é tratada como
      anônima e levada ao login.

## 10. Questões em Aberto

- [ ] **Admin inicial:** confirmamos criar um admin via *seed* (e-mail/senha vindos de variáveis de
      ambiente) para destravar o primeiro acesso? (Proposta: **sim**.)
- [ ] **"Lembrar-me":** queremos sessão estendida além das 8h em dispositivo confiável? (Proposta: **não**
      neste ciclo; manter 8h fixas.)
- [ ] **Bloqueio por tentativas (RF-09):** limite por IP/e-mail e janela de tempo a definir no design.

## 11. Referências

- `CLAUDE.md` §2 (UI shadcn), §3 (motion), §4 (mobile first).
- `src/db/schema.ts` — tabela `users` (já possui `passwordHash`, `role`, `active`).
- `src/lib/rbac.ts` — checagem de permissões por papel.
- `.env.example` — `AUTH_SECRET`, `SESSION_MAX_AGE`.
- Portaria MTE nº 671/2021 (registro de ponto).