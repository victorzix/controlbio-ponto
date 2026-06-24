# Tasks — Registro de Ponto

> **Camada 4 — A EXECUÇÃO.** Marque conforme avança.

## Legenda
- `[ ]` pendente · `[~]` em andamento · `[x]` concluída · dependências `(dep: Tn)`.

## Tarefas

### Núcleo / dados
- [x] **T1** — Tabela `registros_ponto` em `schema.ts` + migration `0003` (aplicada). · _atende: RF-01_
- [x] **T2** — `src/components/ui/markdown.tsx`: renderer Markdown **seguro** (negrito/itálico/código/links
      com allowlist/listas/parágrafos), sem `dangerouslySetInnerHTML`. · _atende: RF-02, RN-04_
- [x] **T3** — `src/lib/ponto/validation.ts`: `createEntrySchema` + `formatWorkedMinutes` + `todayISODate`. · _atende: RN-01..03_
- [x] **T4** — `src/lib/ponto/data.ts`: `listOwnEntries(userId)` (filtra por dono, data desc). · _atende: RF-03, RF-05_
- [x] **T5** — `src/lib/ponto/actions.ts`: `createEntry` (`requirePermission`, valida, dono = sessão). · _atende: RF-01, RF-05, RN-05_

### UI
- [x] **T6** — `(app)/ponto/markdown-editor.tsx`: textarea + toolbar + toggle preview com `<Markdown>`. · _atende: RF-02_
- [x] **T7** — `(app)/ponto/ponto-form.tsx`: dia (default/max hoje), horas/minutos, editor, `useActionState`, motion. · _atende: RF-01, RF-06_
- [x] **T8** — `(app)/ponto/novo/page.tsx`: `requirePermission("ponto:registrar")` + form. · _atende: RF-01_
- [x] **T9** — `(app)/ponto/page.tsx`: lista própria (cards: data, tempo, descrição via `<Markdown>`), vazio, toast. · _atende: RF-03, RF-04, RF-06, RF-07_
- [x] **T10** — `(app)/layout.tsx`: link "Ponto" na nav (gate `ponto:ver_proprio`). · _atende: RF-04_

### Testes
- [x] **T11** — Unitários: `validation` (tempo/dia/descrição) e **`markdown`** (formatação + segurança XSS:
      HTML cru escapado e `javascript:`/`data:` não viram link). Total 29 testes. · _atende: CA-03..05, CA-08_
- [ ] **T12** — Aceitação manual CA-01..09 (preencher `acceptance.md`).

### Finalização
- [x] **T13** — Verificação: `tsc`, `lint`, `test` (29/29), `build` — todos verdes.
- [ ] **T14** — `/code-review` e ajustes.

## Definição de Pronto (DoD)
- [ ] CA-01..09 verificados.
- [ ] `tsc`/`lint`/`test`/`build` verdes.
- [ ] Renderer Markdown coberto por testes de segurança (sem XSS).
- [ ] Telas ok em ~360px.

## Notas de Implementação

- **Sem dependências novas.** Rich text = Markdown com renderer próprio seguro (`components/ui/markdown.tsx`):
  monta nós React (texto auto-escapado), links só com esquema `http(s)`/`mailto`. Sem WYSIWYG/lib externa.
- **Tempo** guardado como `worked_minutes` (int); UI usa dois campos (horas/minutos) e `formatWorkedMinutes`.
- **Dia** como `date` (`mode: "string"`, YYYY-MM-DD) — sem fuso; validado como não-futuro; formatado na mão.
- **Dono sempre da sessão** (`createEntry` usa `currentUser.id`); listagem filtra por dono (RF-05).
- **Editor:** textarea + toolbar (negrito/itálico/link/lista) que insere markdown na seleção + abas
  Escrever/Visualizar (preview com o mesmo `<Markdown>`).
- **Testes:** adicionado `vitest.config.ts` (alias `@` → `src`) para os testes que importam via `@/...` e
  renderizam componentes (`renderToStaticMarkup`). 29 testes no total.
- **Verificação:** `tsc`/`lint`/`test`/`build` verdes. Smoke test em `next start`: anônimo `/ponto` → 307;
  admin → 200; HTML renderiza "8h 30min", `<strong>`, link seguro, e `<script>` **escapado** (XSS ok).
- **Pendências:** aceitação manual CA-01..09 (T12, inclui isolamento entre usuários e mobile) e `/code-review` (T14).
