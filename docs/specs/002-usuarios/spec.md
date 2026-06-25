# Spec — Usuários

| Campo         | Valor              |
| ------------- | ------------------ |
| Status        | Aprovada (em implementação) |
| Autor(es)     | Equipe controlbio  |
| Criada em     | 2026-06-23         |
| Atualizada em | 2026-06-23         |

> **Camada 1 — O QUÊ e o PORQUÊ.** Descreve o problema e os requisitos, sem tecnologia.

## 1. Resumo

Gestão de **usuários** do sistema: criar, listar, editar, ativar/desativar as pessoas que acessam o
controlbio-ponto (admins e funcionários). É o que destrava o uso real do sistema além do admin inicial
criado por *seed* — sem isso ninguém novo entra.

## 2. Problema / Motivação

A autenticação (spec `001`) já valida quem entra, mas hoje só existe o admin do *seed*. Para a empresa
operar, alguém precisa **cadastrar os funcionários**, definir o papel de cada um e **cortar o acesso** de
quem sai. Como ponto eletrônico tem peso trabalhista, o controle de quem existe e de quem pode entrar
precisa ser explícito, auditável e restrito a quem é de direito.

## 3. Objetivos

- Um admin consegue criar, editar e desativar/reativar usuários pelo celular ou desktop.
- O admin consegue **consultar** a lista de usuários e buscar por nome/e-mail.
- Desativar um usuário **corta o acesso na hora** (sessões existentes deixam de valer).
- O sistema impede um admin de se trancar para fora sozinho.

### Fora de escopo

- **Autocadastro público / convite por e-mail.** Contas são criadas internamente por um admin.
- **Troca de senha pelo próprio usuário** e **"esqueci minha senha"** — ficam para uma spec futura.
- **Perfil/foto/dados pessoais** além de nome, e-mail, papel e status.
- **Exclusão definitiva (hard delete)** de usuários — usamos desativação (soft).
- **Vínculo com jornada/escala/ponto** — entra nas features de ponto.
- **Trilha de auditoria detalhada** (quem alterou o quê e quando) — desejável no futuro.

## 4. Personas / Atores

| Ator           | Descrição                                                                 |
| -------------- | ------------------------------------------------------------------------- |
| Admin          | Gerencia todos os usuários (criar/editar/ativar/desativar) e papéis.      |
| Funcionário(a) | Não acessa esta área.                                                     |

> O sistema tem só dois papéis: **admin** e **funcionário** (ver `src/lib/rbac.ts`).

## 5. User Stories

- Como **admin**, quero **cadastrar um novo funcionário com nome, e-mail, papel e senha inicial**, para
  que ele consiga acessar o sistema.
- Como **admin**, quero **editar o papel de um usuário** (ex.: promover um funcionário a admin), para
  refletir mudanças de função.
- Como **admin**, quero **desativar quem saiu da empresa**, para **cortar o acesso imediatamente**.
- Como **admin**, quero **reativar** um usuário desativado por engano.
- Como **admin**, quero **ver e buscar** os usuários cadastrados.
- Como **admin**, NÃO quero conseguir **desativar ou rebaixar a mim mesmo**, para não me trancar para fora.

## 6. Requisitos Funcionais

| ID    | Requisito                                                                                          | Prioridade |
| ----- | -------------------------------------------------------------------------------------------------- | ---------- |
| RF-01 | Listar usuários (nome, e-mail, papel, status), com **busca** por nome/e-mail.                      | Must       |
| RF-02 | Criar usuário (nome, e-mail, papel, senha inicial). Apenas admin.                                  | Must       |
| RF-03 | Editar usuário (nome, e-mail, papel; senha opcional). Apenas admin.                                | Must       |
| RF-04 | Ativar/desativar usuário (soft). Apenas admin.                                                     | Must       |
| RF-05 | Ao desativar, **revogar todas as sessões** do usuário imediatamente.                               | Must       |
| RF-06 | Restringir a gestão de usuários a **admin** (leitura e escrita), via RBAC.                          | Must       |
| RF-07 | Funcionário **não** tem acesso à área de usuários.                                                 | Must       |
| RF-08 | Todas as telas devem ser **mobile first** e seguir o design system.                                | Must       |
| RF-09 | Indicar visualmente o status (ativo/inativo) e o papel de cada usuário.                            | Should     |
| RF-10 | Feedback claro de sucesso/erro nas ações (toast/mensagem).                                          | Should     |
| RF-11 | Definir um **valor/hora opcional** por usuário (criar/editar, apenas admin) e exibi-lo na lista.    | Should     |

## 7. Regras de Negócio

- **RN-01:** E-mail é **único** (case-insensitive). Tentar criar/editar com e-mail já usado por outro
  usuário é bloqueado com mensagem clara.
- **RN-02:** Senha inicial (criação) e nova senha (edição) têm **mínimo de 8 caracteres**. Na edição, o
  campo de senha é opcional — em branco mantém a senha atual.
- **RN-03:** Senha nunca é exibida nem retornada; só se grava o *hash* (reaproveita o hashing do auth).
- **RN-04:** Papel só pode ser um dos válidos: `admin`, `funcionario`.
- **RN-05:** Um admin **não pode desativar a própria conta** nem **alterar o próprio papel** (proteção
  contra auto-bloqueio). Essas mudanças, se necessárias, são feitas por outro admin.
- **RN-06:** Desativar (`active = false`) **não apaga** o usuário; reativar restaura o acesso.
- **RN-07:** Desativação **revoga as sessões** do usuário (ele cai no próximo acesso/navegação).
- **RN-08:** Escrita exige permissão de admin no **servidor** (não confiar só em esconder botões).
- **RN-09:** O **valor/hora** é opcional e **não-negativo**; informado em reais no formulário e guardado
  como **inteiro em centavos** (`hourly_rate_cents`). Vazio = sem valor.

## 8. Requisitos Não-Funcionais

- **Segurança:** autorização verificada no servidor em toda ação (RBAC `usuarios:*`); proteção contra
  auto-bloqueio; sem vazamento de senha/hash.
- **Acessibilidade & Mobile:** mobile first, alvos de toque ≥ 44px, formulários navegáveis por teclado,
  rótulos e mensagens de erro associadas aos campos.
- **Desempenho:** lista responde rápido para o porte de uma PME (dezenas/centenas de usuários); busca
  simples no servidor.
- **LGPD:** coletar o mínimo (nome, e-mail, papel, status).

## 9. Critérios de Aceitação

- [ ] **CA-01:** Admin cria um usuário válido → ele aparece na lista e consegue logar com a senha definida.
- [ ] **CA-02:** Criar/editar com e-mail já existente → bloqueado com mensagem clara (RN-01).
- [ ] **CA-03:** Senha com menos de 8 caracteres → recusada (RN-02).
- [ ] **CA-04:** Admin edita o papel de um usuário (ex.: funcionário → admin) → refletido na lista e no acesso.
- [ ] **CA-05:** Admin desativa um usuário logado em outro dispositivo → na próxima navegação ele é levado
      ao login e **não** consegue mais entrar (RF-05/RN-07).
- [ ] **CA-06:** Admin reativa um usuário desativado → ele volta a conseguir logar.
- [ ] **CA-07:** Admin tenta desativar **a própria conta** ou mudar o **próprio papel** → bloqueado (RN-05).
- [ ] **CA-08:** Tentar uma ação de escrita (criar/editar/desativar) sem ser admin — por URL direta ou
      forçada — é **negada pelo servidor** (RF-06/RN-08).
- [ ] **CA-09:** Funcionário tenta acessar `/usuarios` → negado/redirecionado.
- [ ] **CA-10:** Telas utilizáveis em viewport ~360px (RF-08).

## 10. Questões em Aberto

- [ ] **Último admin:** além de bloquear o auto-bloqueio (RN-05), vale impedir desativar/rebaixar o
      **último admin ativo** do sistema? (Proposta: validar isso também — barato e evita lockout total.)
- [ ] **Paginação/ordenação:** lista simples ordenada por nome basta agora? (Proposta: **sim**; paginar
      quando o volume justificar.)
- [ ] **Comunicação da senha inicial:** por ora o admin informa a senha à pessoa por fora do sistema
      (sem e-mail). Confirmar.

## 11. Referências

- `CLAUDE.md` §2/§3/§4/§5 · `docs/design-system.md`
- `src/lib/rbac.ts` — permissões `usuarios:ler/criar/editar/desativar` (só **admin** as possui).
- `src/db/schema.ts` — tabela `users` (nada novo é necessário).
- `src/lib/auth/` — `hashPassword`, `getCurrentUser`, `invalidateAllSessions`.
- Spec `001-autenticacao` (fora de escopo apontava para esta spec).
