# Integração com ClickUp — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Todo registro de ponto vira (ou alimenta) uma tarefa na sprint correta do ClickUp — atribuída, com o andamento certo e o trabalho comentado — sem que o funcionário toque no ClickUp e sem que uma falha lá impeça o ponto aqui.

**Architecture:** Produtor/consumidor dentro do Postgres. As Server Actions gravam um job na mesma transação do ponto; um worker em container próprio consome com `FOR UPDATE SKIP LOCKED` e executa uma máquina de estados (`resolve → comment → time_entry → finish → done`) que persiste o progresso a cada etapa, tornando o retry seguro.

**Tech Stack:** Next.js 16 (App Router) · TypeScript estrito · Drizzle + PostgreSQL 18 · Zod · React Query · React Hook Form · Tailwind v4 + shadcn/ui · motion · `fetch` e `node:crypto` nativos · `tsx` para o worker. **Nenhuma dependência nova.**

## Global Constraints

Valem para **todas** as tarefas — não se repetem em cada uma.

- **TypeScript estrito.** Sem `any` sem justificativa em comentário.
- **Idioma:** domínio, comentários e documentação em **português**.
- **Path alias:** `@/*` → `src/*`.
- **UI:** Tailwind + shadcn/ui apenas (`CLAUDE.md` §2). Sem CSS solto, sem CSS-in-JS.
- **Animação:** biblioteca `motion` via `motion/react` (`CLAUDE.md` §3). Respeitar `prefers-reduced-motion`.
- **Mobile first** (`CLAUDE.md` §4): começar pelo menor breakpoint, alvos de toque ≥ 44 px, testar em 360 px, sem scroll horizontal.
- **Design system** (`CLAUDE.md` §5): só tokens semânticos (`bg-primary`, `text-muted-foreground`, `border-border`). Decisão visual nova → registrar em `docs/design-system.md` no mesmo commit.
- **Estado** (`CLAUDE.md` §6): busca no servidor via Server Component/Server Action; React Query só quando o **client** busca/sincroniza. Zustand só para estado de client compartilhado.
- **Formulários** (`CLAUDE.md` §7): React Hook Form + `zodResolver`, schema Zod compartilhado, **servidor revalida sempre**. Referência: `src/app/(app)/ponto/ponto-form.tsx`.
- **Banco:** schema em `src/db/schema.ts`; toda mudança gera migration (`npm run db:generate` → `npm run db:migrate`). **Nunca editar migration já aplicada.**
- **RBAC em código** (`src/lib/rbac.ts`): checar com `can()` / `assertCan()` / `requirePermission()`.
- **Segurança:** o token pessoal do ClickUp nunca é devolvido ao navegador, nunca aparece em log, nunca é gravado em claro.
- **Testes:** `npm test` (vitest). Testes ficam ao lado do código (`x.ts` → `x.test.ts`), no molde de `src/lib/ponto/dates.test.ts`.
- **Commits:** todo commit termina com o trailer `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>` (omitido nos comandos abaixo para não poluir).
- **Verificação de tipos:** `npx tsc --noEmit` deve passar ao fim de cada tarefa.

---

## Fase 1 — Fundação

### Task 1: Schema, enums, migration e permissão

**Files:**
- Modify: `src/db/schema.ts`
- Modify: `src/lib/rbac.ts`
- Create: `src/db/migrations/` (migration gerada — nome definido pelo drizzle-kit; `out` do drizzle.config.ts)

**Interfaces:**
- Produces: enums `clickupSyncStatus`, `clickupJobKind`, `clickupJobStage`, `clickupJobStatus`; tabelas `clickupProjectConfig`, `clickupTaskLinks`, `clickupSyncJobs`; colunas novas em `users` e `registrosPonto`; permissão `integracao:configurar`.

- [ ] **Step 1: Adicionar os enums em `src/db/schema.ts`**

Logo abaixo de `projectEnum`:

```ts
/** Estado da sincronização de um registro com o ClickUp (spec 011). */
export const clickupSyncStatus = pgEnum("clickup_sync_status", [
  "pending", // enfileirado, ainda não chegou lá
  "synced", // tarefa + comentário criados
  "failed", // desistiu após as tentativas; exige reenvio manual
  "off", // criado com a integração desligada — não sincroniza
]);

export const clickupJobKind = pgEnum("clickup_job_kind", [
  "push_entry", // primeiro envio do registro
  "correction", // registro editado depois de sincronizado (RN-06)
]);

export const clickupJobStage = pgEnum("clickup_job_stage", [
  "resolve",
  "comment",
  "time_entry",
  "finish",
  "done",
]);

export const clickupJobStatus = pgEnum("clickup_job_status", [
  "pending",
  "running",
  "done",
  "failed",
]);
```

- [ ] **Step 2: Adicionar as colunas em `users` e `registrosPonto`**

Em `users`, antes de `active`:

```ts
  // Vínculo com o membro do ClickUp — usado como assignee (spec 011, RN-09).
  clickupUserId: integer("clickup_user_id"),
  // Token pessoal do ClickUp, CIFRADO (AES-256-GCM). Opcional: sem ele o ponto
  // sincroniza normalmente, só não lança tempo no nome da pessoa (RN-12).
  clickupTokenEnc: varchar("clickup_token_enc", { length: 512 }),
  // Rótulo exibível ("conectado como X"). O token em si nunca volta ao client.
  clickupTokenLabel: varchar("clickup_token_label", { length: 120 }),
```

Em `registrosPonto`, antes de `createdAt`:

```ts
  // Tarefa do ClickUp que recebeu este registro (spec 011).
  clickupTaskId: varchar("clickup_task_id", { length: 64 }),
  clickupTaskUrl: varchar("clickup_task_url", { length: 512 }),
  clickupSyncStatus: clickupSyncStatus("clickup_sync_status")
    .notNull()
    .default("pending"),
```

- [ ] **Step 3: Adicionar as três tabelas novas**

No fim de `src/db/schema.ts`, exatamente como especificado em `design.md` §2.2
(`clickupProjectConfig`, `clickupTaskLinks`, `clickupSyncJobs`), incluindo:

```ts
export const clickupSyncJobs = pgTable(
  "clickup_sync_jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    kind: clickupJobKind("kind").notNull(),
    entryId: uuid("entry_id")
      .notNull()
      .references(() => registrosPonto.id, { onDelete: "cascade" }),
    stage: clickupJobStage("stage").notNull().default("resolve"),
    status: clickupJobStatus("status").notNull().default("pending"),
    attempts: integer("attempts").notNull().default(0),
    nextRunAt: timestamp("next_run_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    lastError: text("last_error"),
    // Progresso persistido por etapa — é o que impede duplicar no retry (RN-13).
    clickupTaskId: varchar("clickup_task_id", { length: 64 }),
    clickupCommentId: varchar("clickup_comment_id", { length: 64 }),
    clickupTimeEntryId: varchar("clickup_time_entry_id", { length: 64 }),
    // Encerrar o cronômetro pediu para mover ao status de conclusão (RF-09).
    moveToReview: boolean("move_to_review").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    index("clickup_sync_jobs_pickup_idx").on(t.status, t.nextRunAt),
    index("clickup_sync_jobs_entry_idx").on(t.entryId),
  ],
);

export type ClickUpSyncJob = typeof clickupSyncJobs.$inferSelect;
export type NewClickUpSyncJob = typeof clickupSyncJobs.$inferInsert;
```

Exportar também os tipos inferidos de `clickupProjectConfig` e `clickupTaskLinks`.

- [ ] **Step 4: Adicionar a permissão no RBAC**

Em `src/lib/rbac.ts`, dentro de `PERMISSIONS`, após o bloco de Usuários:

```ts
  // Integração
  "integracao:configurar", // configurar a integração com o ClickUp (spec 011)
```

`ROLE_PERMISSIONS.admin` já é `ALL`, e `funcionario` não lista a permissão — nada mais a fazer.

- [ ] **Step 5: Gerar e aplicar a migration**

```bash
docker compose up -d db
npm run db:generate
npm run db:migrate
```

Esperado: um arquivo novo em `src/db/migrations/` e a migração aplicada sem erro.

- [ ] **Step 6: Verificar tipos**

Run: `npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 7: Commit**

```bash
git add src/db/schema.ts src/lib/rbac.ts src/db/migrations/
git commit -m "feat(clickup): schema, enums e permissao da integracao"
```

---

## Fase 2 — Núcleo puro (sem rede, sem banco)

### Task 2: Normalização de título

**Files:**
- Create: `src/lib/clickup/title.ts`
- Test: `src/lib/clickup/title.test.ts`

**Interfaces:**
- Produces: `normalizeTitle(raw: string): string`

- [ ] **Step 1: Escrever o teste que falha**

```ts
import { describe, it, expect } from "vitest";
import { normalizeTitle } from "./title";

describe("normalizeTitle", () => {
  it("baixa a caixa", () => {
    expect(normalizeTitle("Criar Acessos")).toBe("criar acessos");
  });

  it("remove acentos", () => {
    expect(normalizeTitle("Migração de Usuários")).toBe("migracao de usuarios");
  });

  it("colapsa espaços repetidos e apara as pontas", () => {
    expect(normalizeTitle("  Criar   Acessos  ")).toBe("criar acessos");
  });

  it("trata o mesmo título escrito de formas diferentes como igual", () => {
    expect(normalizeTitle("CRIAR ACESSOS")).toBe(normalizeTitle("criar  acessos"));
  });

  it("preserva números e hífen", () => {
    expect(normalizeTitle("Sprint 17 - RDM 4021")).toBe("sprint 17 - rdm 4021");
  });

  it("não estoura com string vazia", () => {
    expect(normalizeTitle("")).toBe("");
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm test -- src/lib/clickup/title.test.ts`
Expected: FAIL — `Failed to resolve import "./title"`.

- [ ] **Step 3: Implementar**

```ts
/**
 * Normaliza o título para comparação entre o ponto e a tarefa do ClickUp.
 *
 * É a chave de identidade da atividade (spec 011, RN-01): dois pontos com o
 * mesmo título normalizado, no mesmo projeto, alimentam a MESMA tarefa.
 * Por isso a normalização precisa ser estável e previsível — qualquer mudança
 * aqui reaponta o índice `clickup_task_links` existente.
 */
/** Faixa Unicode das marcas de acentuação que o NFD separa (combining marks). */
const COMBINING_MIN = 0x0300;
const COMBINING_MAX = 0x036f;

export function normalizeTitle(raw: string): string {
  // NFD separa "ç" em "c" + cedilha; aqui descartamos a marca e fica só a letra.
  // Filtrar por faixa de code point (em vez de regex com escape Unicode) mantém
  // o código legível e sem caracteres invisíveis no fonte.
  const semAcento = Array.from(raw.normalize("NFD"))
    .filter((ch) => {
      const cp = ch.codePointAt(0) ?? 0;
      return cp < COMBINING_MIN || cp > COMBINING_MAX;
    })
    .join("");

  return semAcento.toLowerCase().replace(/\s+/g, " ").trim();
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npm test -- src/lib/clickup/title.test.ts`
Expected: PASS (6 testes).

- [ ] **Step 5: Commit**

```bash
git add src/lib/clickup/title.ts src/lib/clickup/title.test.ts
git commit -m "feat(clickup): normalizacao de titulo para casar tarefas"
```

---

### Task 3: Escolha da sprint

A tarefa de lógica mais delicada do plano. Os nomes de sprint reais do workspace usam
formatos **diferentes por frente** — `Sprint 17 (1/9/26 - 15/9/26)` em dia/mês, e
`Sprint 14 (8/24 - 9/6)` em mês/dia **sem ano**. Algumas Listas não têm data alguma
(`Sprint 3 - Abril`). A data da própria Lista, quando preenchida, é sempre preferida.

**Files:**
- Create: `src/lib/clickup/sprint.ts`
- Test: `src/lib/clickup/sprint.test.ts`

**Interfaces:**
- Consumes: nada.
- Produces:
  ```ts
  export type SprintDateFormat = "dmy" | "mdy";
  export type ClickUpList = {
    id: string;
    name: string;
    startDate: Date | null;
    dueDate: Date | null;
  };
  export type SprintPick = {
    listId: string;
    /** Como o destino foi decidido — vira o aviso "sprint não resolvida" na UI. */
    source: "list_date" | "list_name" | "backlog";
  };
  export function parseSprintWindow(
    name: string,
    format: SprintDateFormat,
    referenceISO: string,
  ): { start: string; end: string } | null;
  export function pickSprintList(
    lists: ClickUpList[],
    workDate: string,
    format: SprintDateFormat,
    backlogListId: string,
  ): SprintPick;
  ```

- [ ] **Step 1: Escrever o teste que falha**

```ts
import { describe, it, expect } from "vitest";
import { parseSprintWindow, pickSprintList, type ClickUpList } from "./sprint";

const BACKLOG = "backlog-1";

function list(
  id: string,
  name: string,
  startDate: Date | null = null,
  dueDate: Date | null = null,
): ClickUpList {
  return { id, name, startDate, dueDate };
}

describe("parseSprintWindow", () => {
  it("lê dia/mês/ano de duas posições", () => {
    expect(parseSprintWindow("Sprint 17 (1/9/26 - 15/9/26)", "dmy", "2026-09-02"))
      .toEqual({ start: "2026-09-01", end: "2026-09-15" });
  });

  it("lê mês/dia sem ano, inferindo do dia trabalhado", () => {
    expect(parseSprintWindow("Sprint 14 (8/24 - 9/6)", "mdy", "2026-09-02"))
      .toEqual({ start: "2026-08-24", end: "2026-09-06" });
  });

  it("lê dia/mês sem ano", () => {
    expect(parseSprintWindow("Sprint 6 (17/3 - 31/3)", "dmy", "2026-03-20"))
      .toEqual({ start: "2026-03-17", end: "2026-03-31" });
  });

  it("aceita zero à esquerda", () => {
    expect(parseSprintWindow("Sprint 15 (03/08/26 - 15/8/26)", "dmy", "2026-08-10"))
      .toEqual({ start: "2026-08-03", end: "2026-08-15" });
  });

  it("infere a virada de ano quando a janela cruza dezembro", () => {
    // Ponto em janeiro/26; a sprint começou em dezembro/25.
    expect(parseSprintWindow("Sprint 10 (22/12 - 5/1)", "dmy", "2026-01-03"))
      .toEqual({ start: "2025-12-22", end: "2026-01-05" });
  });

  it("devolve null quando o nome não tem data", () => {
    expect(parseSprintWindow("Sprint 3 - Abril", "dmy", "2026-04-10")).toBeNull();
    expect(parseSprintWindow("Backlog", "dmy", "2026-04-10")).toBeNull();
  });
});

describe("pickSprintList", () => {
  it("prefere a data da própria Lista", () => {
    const lists = [
      // O nome mente de propósito: a data da Lista tem que ganhar.
      list("s17", "Sprint 17 (1/1/26 - 15/1/26)",
        new Date("2026-09-01T00:00:00Z"), new Date("2026-09-15T23:59:59Z")),
    ];
    expect(pickSprintList(lists, "2026-09-02", "dmy", BACKLOG))
      .toEqual({ listId: "s17", source: "list_date" });
  });

  it("cai no nome quando a Lista não tem data", () => {
    const lists = [list("s17", "Sprint 17 (1/9/26 - 15/9/26)")];
    expect(pickSprintList(lists, "2026-09-02", "dmy", BACKLOG))
      .toEqual({ listId: "s17", source: "list_name" });
  });

  it("escolhe a sprint certa entre várias", () => {
    const lists = [
      list("s16", "Sprint 16 (16/8/26 - 31/8/26)"),
      list("s17", "Sprint 17 (1/9/26 - 15/9/26)"),
      list("s18", "Sprint 18 (16/9/26 - 30/9/26)"),
    ];
    expect(pickSprintList(lists, "2026-09-20", "dmy", BACKLOG).listId).toBe("s18");
  });

  it("inclui os extremos da janela", () => {
    const lists = [list("s17", "Sprint 17 (1/9/26 - 15/9/26)")];
    expect(pickSprintList(lists, "2026-09-01", "dmy", BACKLOG).listId).toBe("s17");
    expect(pickSprintList(lists, "2026-09-15", "dmy", BACKLOG).listId).toBe("s17");
  });

  it("cai no backlog quando nenhuma sprint contém o dia", () => {
    const lists = [list("s17", "Sprint 17 (1/9/26 - 15/9/26)")];
    expect(pickSprintList(lists, "2026-10-20", "dmy", BACKLOG))
      .toEqual({ listId: BACKLOG, source: "backlog" });
  });

  it("cai no backlog quando não há Lista alguma", () => {
    expect(pickSprintList([], "2026-09-02", "dmy", BACKLOG))
      .toEqual({ listId: BACKLOG, source: "backlog" });
  });

  it("ignora a própria Lista de backlog na busca", () => {
    const lists = [list(BACKLOG, "Backlog")];
    expect(pickSprintList(lists, "2026-09-02", "dmy", BACKLOG).source).toBe("backlog");
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm test -- src/lib/clickup/sprint.test.ts`
Expected: FAIL — `Failed to resolve import "./sprint"`.

- [ ] **Step 3: Implementar**

```ts
/**
 * Escolha da Lista (sprint) que vai receber o ponto — spec 011, RF-06/RF-07.
 *
 * Ordem de confiança:
 *   1. data da própria Lista (`start_date`/`due_date`) — fonte confiável;
 *   2. parse do NOME da Lista — rede de segurança, porque os nomes reais usam
 *      formatos diferentes por frente (dia/mês em GPA, mês/dia em RPA/AFA) e
 *      alguns não têm data nenhuma;
 *   3. Lista de backlog configurada — e o ponto é sinalizado na UI.
 *
 * Tudo em datas "YYYY-MM-DD" (sem hora) para não sofrer com fuso — mesma decisão
 * de `registros_ponto.work_date` (spec 003).
 */

export type SprintDateFormat = "dmy" | "mdy";

export type ClickUpList = {
  id: string;
  name: string;
  startDate: Date | null;
  dueDate: Date | null;
};

export type SprintPick = {
  listId: string;
  source: "list_date" | "list_name" | "backlog";
};

/** Captura "(1/9/26 - 15/9/26)" ou "(8/24 - 9/6)" no fim ou no meio do nome. */
const WINDOW_RE =
  /\((\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\s*[-–—]\s*(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\)/;

function toISO(year: number, month: number, day: number): string {
  const mm = String(month).padStart(2, "0");
  const dd = String(day).padStart(2, "0");
  return `${year}-${mm}-${dd}`;
}

/** "26" -> 2026; "2026" -> 2026. */
function expandYear(raw: string): number {
  const n = Number(raw);
  return raw.length <= 2 ? 2000 + n : n;
}

export function parseSprintWindow(
  name: string,
  format: SprintDateFormat,
  referenceISO: string,
): { start: string; end: string } | null {
  const m = WINDOW_RE.exec(name);
  if (!m) return null;

  const [, a1, a2, aYear, b1, b2, bYear] = m;
  // "dmy" => primeiro número é dia; "mdy" => primeiro número é mês.
  const startDay = Number(format === "dmy" ? a1 : a2);
  const startMonth = Number(format === "dmy" ? a2 : a1);
  const endDay = Number(format === "dmy" ? b1 : b2);
  const endMonth = Number(format === "dmy" ? b2 : b1);

  if (
    startMonth < 1 || startMonth > 12 || endMonth < 1 || endMonth > 12 ||
    startDay < 1 || startDay > 31 || endDay < 1 || endDay > 31
  ) {
    return null;
  }

  const refYear = Number(referenceISO.slice(0, 4));
  const refMonth = Number(referenceISO.slice(5, 7));

  // Sem ano no nome, inferimos do dia trabalhado. O caso chato é a virada:
  // ponto em janeiro numa sprint que começou em dezembro (e vice-versa).
  let sy = aYear ? expandYear(aYear) : refYear;
  let ey = bYear ? expandYear(bYear) : refYear;

  if (!aYear && !bYear) {
    if (refMonth === 1 && startMonth === 12) sy = refYear - 1;
    if (refMonth === 12 && endMonth === 1) ey = refYear + 1;
    // Janela que cruza o ano sem referência ambígua (ex.: 22/12 - 5/1).
    if (sy === ey && startMonth === 12 && endMonth === 1) ey = sy + 1;
  }

  return { start: toISO(sy, startMonth, startDay), end: toISO(ey, endMonth, endDay) };
}

/** Data (com hora) do ClickUp para "YYYY-MM-DD" em UTC. */
function dateToISO(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function pickSprintList(
  lists: ClickUpList[],
  workDate: string,
  format: SprintDateFormat,
  backlogListId: string,
): SprintPick {
  const candidates = lists.filter((l) => l.id !== backlogListId);

  // 1. Data da própria Lista — a fonte confiável.
  for (const l of candidates) {
    if (!l.startDate || !l.dueDate) continue;
    if (dateToISO(l.startDate) <= workDate && workDate <= dateToISO(l.dueDate)) {
      return { listId: l.id, source: "list_date" };
    }
  }

  // 2. Nome da Lista — rede de segurança.
  for (const l of candidates) {
    const w = parseSprintWindow(l.name, format, workDate);
    if (w && w.start <= workDate && workDate <= w.end) {
      return { listId: l.id, source: "list_name" };
    }
  }

  // 3. Backlog — e a UI sinaliza "sprint não resolvida".
  return { listId: backlogListId, source: "backlog" };
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npm test -- src/lib/clickup/sprint.test.ts`
Expected: PASS (14 testes).

- [ ] **Step 5: Commit**

```bash
git add src/lib/clickup/sprint.ts src/lib/clickup/sprint.test.ts
git commit -m "feat(clickup): escolha da sprint por data da lista com fallback de nome"
```

---

### Task 4: Classificação de status

**Files:**
- Create: `src/lib/clickup/status.ts`
- Test: `src/lib/clickup/status.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export type ClickUpStatus = { id: string; status: string; type: string };
  export type StatusClass = "parado" | "adiante" | "concluido";
  export function classifyStatus(type: string): StatusClass;
  export function shouldMoveToInProgress(currentType: string): boolean;
  export function findStatusByName(statuses: ClickUpStatus[], name: string): ClickUpStatus | null;
  ```

- [ ] **Step 1: Escrever o teste que falha**

```ts
import { describe, it, expect } from "vitest";
import { classifyStatus, shouldMoveToInProgress, findStatusByName } from "./status";

describe("classifyStatus", () => {
  it("open e unstarted são parados", () => {
    expect(classifyStatus("open")).toBe("parado");
    expect(classifyStatus("unstarted")).toBe("parado");
  });

  it("custom é adiante", () => {
    expect(classifyStatus("custom")).toBe("adiante");
  });

  it("done e closed são concluídos", () => {
    expect(classifyStatus("done")).toBe("concluido");
    expect(classifyStatus("closed")).toBe("concluido");
  });

  it("tipo desconhecido é tratado como adiante (não mexe)", () => {
    expect(classifyStatus("qualquer-coisa")).toBe("adiante");
  });
});

describe("shouldMoveToInProgress", () => {
  it("move só o que está parado — RN-02", () => {
    expect(shouldMoveToInProgress("open")).toBe(true);
    expect(shouldMoveToInProgress("unstarted")).toBe(true);
  });

  it("não regride quem já está adiante ou concluído", () => {
    expect(shouldMoveToInProgress("custom")).toBe(false);
    expect(shouldMoveToInProgress("done")).toBe(false);
    expect(shouldMoveToInProgress("closed")).toBe(false);
  });
});

describe("findStatusByName", () => {
  // Status reais do folder RPA do workspace.
  const statuses = [
    { id: "a", status: "backlog", type: "open" },
    { id: "b", status: "fazendo", type: "custom" },
    { id: "c", status: "em produção", type: "closed" },
  ];

  it("acha ignorando caixa e acento", () => {
    expect(findStatusByName(statuses, "FAZENDO")?.id).toBe("b");
    expect(findStatusByName(statuses, "em producao")?.id).toBe("c");
  });

  it("devolve null quando o status não existe na Lista", () => {
    expect(findStatusByName(statuses, "waiting code review")).toBeNull();
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm test -- src/lib/clickup/status.test.ts`
Expected: FAIL — módulo inexistente.

- [ ] **Step 3: Implementar**

```ts
import { normalizeTitle } from "./title";

/**
 * Classificação de status da tarefa — spec 011, RN-02/RN-03.
 *
 * Os folders do workspace usam nomes COMPLETAMENTE diferentes (`GPA` tem
 * "em andamento"/"em teste"; `RPA` tem "fazendo"/"homologando"), então a regra
 * se apoia no campo `type` que a API devolve, não no nome.
 */

export type ClickUpStatus = { id: string; status: string; type: string };
export type StatusClass = "parado" | "adiante" | "concluido";

export function classifyStatus(type: string): StatusClass {
  if (type === "open" || type === "unstarted") return "parado";
  if (type === "done" || type === "closed") return "concluido";
  // Desconhecido conta como "adiante": na dúvida, não mexer no board de ninguém.
  return "adiante";
}

/** Só tarefa parada vai para "em andamento" — nunca regredimos (RN-02). */
export function shouldMoveToInProgress(currentType: string): boolean {
  return classifyStatus(currentType) === "parado";
}

/** Busca tolerante a caixa e acento — o admin digita/escolhe o nome exibido. */
export function findStatusByName(
  statuses: ClickUpStatus[],
  name: string,
): ClickUpStatus | null {
  const target = normalizeTitle(name);
  return statuses.find((s) => normalizeTitle(s.status) === target) ?? null;
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npm test -- src/lib/clickup/status.test.ts`
Expected: PASS (8 testes).

- [ ] **Step 5: Commit**

```bash
git add src/lib/clickup/status.ts src/lib/clickup/status.test.ts
git commit -m "feat(clickup): classificacao de status por type da api"
```

---

### Task 5: Cifra do token pessoal

**Files:**
- Create: `src/lib/clickup/crypto.ts`
- Test: `src/lib/clickup/crypto.test.ts`

**Interfaces:**
- Produces: `encryptToken(plain: string, keyBase64: string): string`, `decryptToken(payload: string, keyBase64: string): string`, `generateKeyBase64(): string`

- [ ] **Step 1: Escrever o teste que falha**

```ts
import { describe, it, expect } from "vitest";
import { encryptToken, decryptToken, generateKeyBase64 } from "./crypto";

const KEY = generateKeyBase64();
const OTHER_KEY = generateKeyBase64();

describe("encryptToken / decryptToken", () => {
  it("faz a ida e volta", () => {
    const token = "pk_12345678_ABCDEFGHIJKLMNOP";
    expect(decryptToken(encryptToken(token, KEY), KEY)).toBe(token);
  });

  it("nunca devolve o texto em claro no payload", () => {
    const token = "pk_segredo_do_usuario";
    expect(encryptToken(token, KEY)).not.toContain("pk_segredo");
  });

  it("gera payload diferente a cada cifra (IV aleatório)", () => {
    const token = "pk_igual";
    expect(encryptToken(token, KEY)).not.toBe(encryptToken(token, KEY));
  });

  it("recusa decifrar com a chave errada", () => {
    const payload = encryptToken("pk_abc", KEY);
    expect(() => decryptToken(payload, OTHER_KEY)).toThrow();
  });

  it("recusa payload adulterado (GCM autentica)", () => {
    const payload = encryptToken("pk_abc", KEY);
    const parts = payload.split(".");
    parts[2] = Buffer.from("outra-coisa").toString("base64");
    expect(() => decryptToken(parts.join("."), KEY)).toThrow();
  });

  it("recusa payload com formato inválido", () => {
    expect(() => decryptToken("nao-e-um-payload", KEY)).toThrow();
  });

  it("recusa chave com tamanho errado", () => {
    const curta = Buffer.alloc(16).toString("base64");
    expect(() => encryptToken("pk_abc", curta)).toThrow();
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm test -- src/lib/clickup/crypto.test.ts`
Expected: FAIL — módulo inexistente.

- [ ] **Step 3: Implementar**

```ts
import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
} from "node:crypto";

/**
 * Cifra do token pessoal do ClickUp — spec 011, RNF de segurança.
 *
 * É segredo de terceiro: só pode existir em claro em memória, no instante da
 * chamada. AES-256-GCM porque além de cifrar ele AUTENTICA — payload adulterado
 * falha ao decifrar em vez de devolver lixo.
 *
 * Formato: base64(iv).base64(authTag).base64(ciphertext)
 * A chave vive em CLICKUP_TOKEN_ENC_KEY (fora do banco) — vazamento do dump não
 * expõe token nenhum.
 */

const IV_BYTES = 12; // recomendado para GCM
const KEY_BYTES = 32; // AES-256

function loadKey(keyBase64: string): Buffer {
  const key = Buffer.from(keyBase64, "base64");
  if (key.length !== KEY_BYTES) {
    throw new Error(
      `CLICKUP_TOKEN_ENC_KEY inválida: esperados ${KEY_BYTES} bytes em base64, veio ${key.length}.`,
    );
  }
  return key;
}

/** Gera uma chave nova — use para preencher CLICKUP_TOKEN_ENC_KEY no .env. */
export function generateKeyBase64(): string {
  return randomBytes(KEY_BYTES).toString("base64");
}

export function encryptToken(plain: string, keyBase64: string): string {
  const key = loadKey(keyBase64);
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(plain, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return [
    iv.toString("base64"),
    tag.toString("base64"),
    ciphertext.toString("base64"),
  ].join(".");
}

export function decryptToken(payload: string, keyBase64: string): string {
  const key = loadKey(keyBase64);
  const parts = payload.split(".");
  if (parts.length !== 3) {
    throw new Error("Token cifrado com formato inválido.");
  }
  const [ivB64, tagB64, dataB64] = parts;
  const decipher = createDecipheriv(
    "aes-256-gcm",
    key,
    Buffer.from(ivB64, "base64"),
  );
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(dataB64, "base64")),
    decipher.final(),
  ]).toString("utf8");
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npm test -- src/lib/clickup/crypto.test.ts`
Expected: PASS (7 testes).

- [ ] **Step 5: Commit**

```bash
git add src/lib/clickup/crypto.ts src/lib/clickup/crypto.test.ts
git commit -m "feat(clickup): cifra aes-256-gcm do token pessoal"
```

---

### Task 6: Erros e backoff

**Files:**
- Create: `src/lib/clickup/errors.ts`
- Test: `src/lib/clickup/errors.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export type ErrorCode =
    | "RATE_LIMIT" | "INDISPONIVEL" | "TOKEN_INVALIDO" | "TAREFA_SUMIU"
    | "REQUISICAO_INVALIDA" | "CONFIG_AUSENTE" | "SEM_VINCULO" | "DESCONHECIDO";
  export class ClickUpError extends Error {
    code: ErrorCode; status: number | null; retryable: boolean; resetAt: Date | null;
  }
  export function classifyHttp(status: number, body: string, resetAt: Date | null): ClickUpError;
  export function computeBackoffMs(attempt: number): number;
  export const BACKOFF_STEPS_MS: number[];
  ```

- [ ] **Step 1: Escrever o teste que falha**

```ts
import { describe, it, expect } from "vitest";
import { classifyHttp, computeBackoffMs, BACKOFF_STEPS_MS } from "./errors";

describe("classifyHttp", () => {
  it("429 é recuperável e carrega o horário de liberação", () => {
    const reset = new Date("2026-09-02T10:00:00Z");
    const err = classifyHttp(429, "", reset);
    expect(err.code).toBe("RATE_LIMIT");
    expect(err.retryable).toBe(true);
    expect(err.resetAt).toEqual(reset);
  });

  it("5xx é recuperável", () => {
    expect(classifyHttp(500, "boom", null).retryable).toBe(true);
    expect(classifyHttp(503, "", null).code).toBe("INDISPONIVEL");
  });

  it("401 e 403 são terminais", () => {
    expect(classifyHttp(401, "", null).code).toBe("TOKEN_INVALIDO");
    expect(classifyHttp(401, "", null).retryable).toBe(false);
    expect(classifyHttp(403, "", null).retryable).toBe(false);
  });

  it("404 vira TAREFA_SUMIU e é recuperável (limpa o índice e recria)", () => {
    const err = classifyHttp(404, "", null);
    expect(err.code).toBe("TAREFA_SUMIU");
    expect(err.retryable).toBe(true);
  });

  it("400 é terminal e preserva o corpo para diagnóstico", () => {
    const err = classifyHttp(400, '{"err":"Status not found"}', null);
    expect(err.code).toBe("REQUISICAO_INVALIDA");
    expect(err.retryable).toBe(false);
    expect(err.message).toContain("Status not found");
  });
});

describe("computeBackoffMs", () => {
  it("cresce a cada tentativa", () => {
    expect(computeBackoffMs(0)).toBe(BACKOFF_STEPS_MS[0]);
    expect(computeBackoffMs(1)).toBe(BACKOFF_STEPS_MS[1]);
    expect(computeBackoffMs(0)).toBeLessThan(computeBackoffMs(3));
  });

  it("satura no último degrau em vez de estourar", () => {
    const ultimo = BACKOFF_STEPS_MS[BACKOFF_STEPS_MS.length - 1];
    expect(computeBackoffMs(99)).toBe(ultimo);
  });

  it("primeiro degrau é 1 minuto e último é 6 horas", () => {
    expect(BACKOFF_STEPS_MS[0]).toBe(60_000);
    expect(BACKOFF_STEPS_MS[BACKOFF_STEPS_MS.length - 1]).toBe(6 * 60 * 60_000);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm test -- src/lib/clickup/errors.test.ts`
Expected: FAIL — módulo inexistente.

- [ ] **Step 3: Implementar**

```ts
/**
 * Taxonomia de erro da integração — spec 011, design §5.2.
 *
 * A distinção que importa é RECUPERÁVEL vs TERMINAL: recuperável volta para a
 * fila com backoff; terminal marca o job como `failed` e pede ação humana.
 * Insistir num erro terminal só queima o limite de requisições.
 */

export type ErrorCode =
  | "RATE_LIMIT"
  | "INDISPONIVEL"
  | "TOKEN_INVALIDO"
  | "TAREFA_SUMIU"
  | "REQUISICAO_INVALIDA"
  | "CONFIG_AUSENTE"
  | "SEM_VINCULO"
  | "DESCONHECIDO";

export class ClickUpError extends Error {
  readonly code: ErrorCode;
  readonly status: number | null;
  readonly retryable: boolean;
  readonly resetAt: Date | null;

  constructor(init: {
    code: ErrorCode;
    message: string;
    status?: number | null;
    retryable: boolean;
    resetAt?: Date | null;
  }) {
    super(init.message);
    this.name = "ClickUpError";
    this.code = init.code;
    this.status = init.status ?? null;
    this.retryable = init.retryable;
    this.resetAt = init.resetAt ?? null;
  }
}

export function classifyHttp(
  status: number,
  body: string,
  resetAt: Date | null,
): ClickUpError {
  if (status === 429) {
    return new ClickUpError({
      code: "RATE_LIMIT",
      message: "Limite de requisições do ClickUp atingido.",
      status,
      retryable: true,
      resetAt,
    });
  }
  if (status >= 500) {
    return new ClickUpError({
      code: "INDISPONIVEL",
      message: `ClickUp indisponível (HTTP ${status}). ${body}`.trim(),
      status,
      retryable: true,
    });
  }
  if (status === 401 || status === 403) {
    return new ClickUpError({
      code: "TOKEN_INVALIDO",
      message: "Token do ClickUp inválido ou sem permissão.",
      status,
      retryable: false,
    });
  }
  if (status === 404) {
    // Tarefa apagada no ClickUp: o índice local está velho. Limpar e recriar.
    return new ClickUpError({
      code: "TAREFA_SUMIU",
      message: "Recurso não encontrado no ClickUp.",
      status,
      retryable: true,
    });
  }
  if (status === 400 || status === 422) {
    return new ClickUpError({
      code: "REQUISICAO_INVALIDA",
      message: `Requisição rejeitada pelo ClickUp: ${body}`,
      status,
      retryable: false,
    });
  }
  return new ClickUpError({
    code: "DESCONHECIDO",
    message: `Erro inesperado do ClickUp (HTTP ${status}). ${body}`.trim(),
    status,
    retryable: false,
  });
}

/** 1min → 5min → 15min → 1h → 6h. */
export const BACKOFF_STEPS_MS = [
  60_000,
  5 * 60_000,
  15 * 60_000,
  60 * 60_000,
  6 * 60 * 60_000,
];

export function computeBackoffMs(attempt: number): number {
  const i = Math.min(Math.max(attempt, 0), BACKOFF_STEPS_MS.length - 1);
  return BACKOFF_STEPS_MS[i];
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npm test -- src/lib/clickup/errors.test.ts`
Expected: PASS (8 testes).

- [ ] **Step 5: Commit**

```bash
git add src/lib/clickup/errors.ts src/lib/clickup/errors.test.ts
git commit -m "feat(clickup): taxonomia de erro e backoff"
```

---

### Task 7: Controle de limite de requisições

**Files:**
- Create: `src/lib/clickup/rate-limit.ts`
- Test: `src/lib/clickup/rate-limit.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export type RateLimiter = {
    take(): Promise<void>;
    observe(headers: { remaining: number | null; resetAt: Date | null }): void;
  };
  export function createRateLimiter(opts: {
    perMinute: number;
    now?: () => number;
    sleep?: (ms: number) => Promise<void>;
  }): RateLimiter;
  ```

- [ ] **Step 1: Escrever o teste que falha**

```ts
import { describe, it, expect } from "vitest";
import { createRateLimiter } from "./rate-limit";

/** Relógio e sono falsos: o teste não pode esperar de verdade. */
function harness(perMinute: number) {
  let now = 0;
  const slept: number[] = [];
  const limiter = createRateLimiter({
    perMinute,
    now: () => now,
    sleep: async (ms) => {
      slept.push(ms);
      now += ms;
    },
  });
  return { limiter, slept, advance: (ms: number) => { now += ms; } };
}

describe("createRateLimiter", () => {
  it("deixa passar até o limite sem esperar", async () => {
    const { limiter, slept } = harness(3);
    await limiter.take();
    await limiter.take();
    await limiter.take();
    expect(slept).toEqual([]);
  });

  it("espera quando o balde esvazia", async () => {
    const { limiter, slept } = harness(2);
    await limiter.take();
    await limiter.take();
    await limiter.take();
    expect(slept.length).toBe(1);
    expect(slept[0]).toBeGreaterThan(0);
  });

  it("reabastece com o passar do tempo", async () => {
    const { limiter, slept, advance } = harness(2);
    await limiter.take();
    await limiter.take();
    advance(60_000);
    await limiter.take();
    expect(slept).toEqual([]);
  });

  it("encolhe o balde quando o ClickUp diz que sobrou pouco", async () => {
    const { limiter, slept } = harness(100);
    limiter.observe({ remaining: 0, resetAt: new Date(30_000) });
    await limiter.take();
    expect(slept.length).toBe(1);
  });

  it("nunca espera com resetAt no passado", async () => {
    const { limiter, slept } = harness(100);
    limiter.observe({ remaining: 0, resetAt: new Date(-5_000) });
    await limiter.take();
    expect(slept).toEqual([]);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm test -- src/lib/clickup/rate-limit.test.ts`
Expected: FAIL — módulo inexistente.

- [ ] **Step 3: Implementar**

```ts
/**
 * Token bucket para respeitar o limite do ClickUp — spec 011, RNF de limite externo.
 *
 * O plano do workspace dá ~100 req/min e o pipeline gasta várias por ponto.
 * Quando alguém lança um mês atrasado de uma vez (CA-19), a fila tem que ficar
 * LENTA, não quebrar. Por isso aqui a gente espera em vez de deixar dar 429.
 *
 * `now` e `sleep` são injetáveis para o teste não depender de tempo real.
 */

export type RateLimiter = {
  take(): Promise<void>;
  observe(headers: { remaining: number | null; resetAt: Date | null }): void;
};

export function createRateLimiter(opts: {
  perMinute: number;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
}): RateLimiter {
  const now = opts.now ?? (() => Date.now());
  const sleep =
    opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));

  const capacity = Math.max(1, opts.perMinute);
  const refillPerMs = capacity / 60_000;

  let tokens = capacity;
  let lastRefill = now();
  /** Quando o ClickUp diz que zerou, seguramos até este instante. */
  let blockedUntil = 0;

  function refill() {
    const t = now();
    const elapsed = t - lastRefill;
    if (elapsed > 0) {
      tokens = Math.min(capacity, tokens + elapsed * refillPerMs);
      lastRefill = t;
    }
  }

  return {
    async take() {
      const blockWait = blockedUntil - now();
      if (blockWait > 0) {
        await sleep(blockWait);
        blockedUntil = 0;
      }

      refill();
      if (tokens < 1) {
        // Tempo até um token voltar a existir.
        await sleep(Math.ceil((1 - tokens) / refillPerMs));
        refill();
      }
      tokens -= 1;
    },

    observe({ remaining, resetAt }) {
      // `resetAt` no passado é leitura velha: a janela do ClickUp já virou e
      // essa contagem não vale mais nada. Ignoramos por completo — senão uma
      // resposta atrasada com `remaining: 0` prende `tokens` em zero e a fila
      // dorme sem motivo, com o balde do ClickUp já cheio.
      const stale = resetAt !== null && resetAt.getTime() <= now();
      if (stale) return;

      if (remaining !== null) {
        // O servidor é a autoridade: nunca acreditamos em mais do que ele diz.
        tokens = Math.min(tokens, remaining);
      }
      if (remaining !== null && remaining <= 0 && resetAt) {
        blockedUntil = Math.max(blockedUntil, resetAt.getTime());
      }
    },
  };
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npm test -- src/lib/clickup/rate-limit.test.ts`
Expected: PASS (5 testes).

- [ ] **Step 5: Commit**

```bash
git add src/lib/clickup/rate-limit.ts src/lib/clickup/rate-limit.test.ts
git commit -m "feat(clickup): token bucket respeitando o limite da api"
```

---

## Fase 3 — Cliente HTTP

### Task 8: `ClickUpClient`

**Files:**
- Create: `src/lib/clickup/client.ts`
- Test: `src/lib/clickup/client.test.ts`

**Interfaces:**
- Consumes: `classifyHttp`, `ClickUpError` (Task 6); `createRateLimiter` (Task 7); `ClickUpList` (Task 3); `ClickUpStatus` (Task 4).
- Produces:
  ```ts
  export type ClickUpClient = {
    getCurrentUser(): Promise<{ id: number; username: string; email: string }>;
    getMembers(): Promise<{ id: number; username: string; email: string }[]>;
    getSpaces(): Promise<{ id: string; name: string }[]>;
    getFolders(spaceId: string): Promise<{ id: string; name: string }[]>;
    getLists(folderId: string): Promise<ClickUpList[]>;
    getListStatuses(listId: string): Promise<ClickUpStatus[]>;
    findTasksInLists(listIds: string[]): Promise<ClickUpTask[]>;
    createTask(listId: string, input: CreateTaskInput): Promise<ClickUpTask>;
    updateTask(taskId: string, input: UpdateTaskInput): Promise<void>;
    moveTaskToList(taskId: string, listId: string): Promise<void>;
    createComment(taskId: string, markdown: string): Promise<string>;
    createTimeEntry(input: TimeEntryInput, token: string): Promise<string>;
  };
  export type ClickUpTask = {
    id: string; name: string; url: string;
    statusName: string; statusType: string;
    listId: string; assigneeIds: number[];
  };
  export type CreateTaskInput = {
    name: string; markdownDescription: string; status: string; assignees: number[];
  };
  export type UpdateTaskInput = { status?: string; addAssignees?: number[] };
  export type TimeEntryInput = {
    taskId: string; startMs: number; durationMs: number; description: string;
  };
  export function createClickUpClient(opts: {
    token: string; teamId: string; perMinute?: number;
    fetchImpl?: typeof fetch; baseUrl?: string;
  }): ClickUpClient;
  ```

- [ ] **Step 1: Escrever o teste que falha**

```ts
import { describe, it, expect } from "vitest";
import { createClickUpClient } from "./client";
import { ClickUpError } from "./errors";

type Call = { url: string; init: RequestInit | undefined };

/** fetch falso: devolve respostas roteirizadas e grava o que foi chamado. */
function fakeFetch(
  routes: { match: string; status?: number; body?: unknown; headers?: Record<string, string> }[],
) {
  const calls: Call[] = [];
  const impl = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, init });
    const route = routes.find((r) => url.includes(r.match));
    if (!route) throw new Error(`rota não roteirizada: ${url}`);
    return new Response(JSON.stringify(route.body ?? {}), {
      status: route.status ?? 200,
      headers: { "content-type": "application/json", ...(route.headers ?? {}) },
    });
  }) as unknown as typeof fetch;
  return { impl, calls };
}

function client(routes: Parameters<typeof fakeFetch>[0]) {
  const { impl, calls } = fakeFetch(routes);
  return {
    calls,
    c: createClickUpClient({
      token: "pk_teste",
      teamId: "9013352145",
      perMinute: 10_000, // sem espera no teste
      fetchImpl: impl,
    }),
  };
}

describe("ClickUpClient", () => {
  it("manda o token sem o prefixo Bearer", async () => {
    const { c, calls } = client([
      { match: "/v2/user", body: { user: { id: 1, username: "Victor", email: "v@x.com" } } },
    ]);
    await c.getCurrentUser();
    const headers = calls[0].init?.headers as Record<string, string>;
    expect(headers.Authorization).toBe("pk_teste");
  });

  it("converte a Lista, incluindo datas nulas", async () => {
    const { c } = client([
      {
        match: "/v2/folder/90132809457/list",
        body: {
          lists: [
            { id: "s17", name: "Sprint 17", start_date: "1756684800000", due_date: "1757894400000" },
            { id: "bk", name: "Backlog", start_date: null, due_date: null },
          ],
        },
      },
    ]);
    const lists = await c.getLists("90132809457");
    expect(lists[0].startDate).toBeInstanceOf(Date);
    expect(lists[1].startDate).toBeNull();
  });

  it("cria tarefa com markdown_description, status e assignee", async () => {
    const { c, calls } = client([
      {
        match: "/v2/list/s17/task",
        body: { id: "t1", name: "Criar Acessos", url: "https://app.clickup.com/t/t1",
                status: { status: "fazendo", type: "custom" }, list: { id: "s17" }, assignees: [{ id: 7 }] },
      },
    ]);
    const task = await c.createTask("s17", {
      name: "Criar Acessos",
      markdownDescription: "**feito**",
      status: "fazendo",
      assignees: [7],
    });
    expect(task.id).toBe("t1");
    expect(task.statusType).toBe("custom");
    expect(task.assigneeIds).toEqual([7]);
    const body = JSON.parse(String(calls[0].init?.body));
    expect(body.markdown_description).toBe("**feito**");
    expect(body.assignees).toEqual([7]);
  });

  it("adiciona assignee sem remover os existentes", async () => {
    const { c, calls } = client([{ match: "/v2/task/t1", body: {} }]);
    await c.updateTask("t1", { addAssignees: [7] });
    const body = JSON.parse(String(calls[0].init?.body));
    expect(body.assignees).toEqual({ add: [7] });
  });

  it("move a tarefa pelo endpoint v3 de home_list", async () => {
    const { c, calls } = client([{ match: "/v3/workspaces/", body: {} }]);
    await c.moveTaskToList("t1", "s18");
    expect(calls[0].url).toContain("/v3/workspaces/9013352145/tasks/t1/home_list/s18");
    expect(calls[0].init?.method).toBe("PUT");
  });

  it("lança tempo com o token pessoal, não com o de serviço", async () => {
    const { c, calls } = client([
      { match: "/time_entries", body: { data: { id: "te1" } } },
    ]);
    const id = await c.createTimeEntry(
      { taskId: "t1", startMs: 1, durationMs: 60_000, description: "x" },
      "pk_pessoal",
    );
    expect(id).toBe("te1");
    const headers = calls[0].init?.headers as Record<string, string>;
    expect(headers.Authorization).toBe("pk_pessoal");
  });

  it("traduz 401 em ClickUpError terminal", async () => {
    const { c } = client([{ match: "/v2/user", status: 401, body: { err: "Token inválido" } }]);
    await expect(c.getCurrentUser()).rejects.toBeInstanceOf(ClickUpError);
    await expect(c.getCurrentUser()).rejects.toMatchObject({
      code: "TOKEN_INVALIDO",
      retryable: false,
    });
  });

  it("traduz 429 lendo o X-RateLimit-Reset", async () => {
    const { c } = client([
      { match: "/v2/user", status: 429, body: {}, headers: { "X-RateLimit-Reset": "1756684800" } },
    ]);
    await expect(c.getCurrentUser()).rejects.toMatchObject({ code: "RATE_LIMIT", retryable: true });
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm test -- src/lib/clickup/client.test.ts`
Expected: FAIL — módulo inexistente.

- [ ] **Step 3: Implementar**

Escrever `src/lib/clickup/client.ts` conforme os contratos acima e a tabela de endpoints
de `design.md` §5.1. Pontos que os testes travam e não podem ser alterados:

- header `Authorization` recebe o token **cru** (sem `Bearer`);
- `getLists` converte `start_date`/`due_date` (string de milissegundos) em `Date | null`;
- `createTask` envia `markdown_description`, `status` e `assignees` (array);
- `updateTask` envia `assignees: { add: [...] }` para **acrescentar** sem remover;
- `moveTaskToList` usa `PUT /v3/workspaces/{teamId}/tasks/{taskId}/home_list/{listId}`;
- `createTimeEntry` usa o **token recebido por parâmetro**, nunca o do cliente;
- toda resposta não-ok passa por `classifyHttp(status, body, resetAt)`, com `resetAt` lido
  de `X-RateLimit-Reset` (segundos Unix → `Date`);
- toda resposta ok chama `limiter.observe()` com `X-RateLimit-Remaining` e `X-RateLimit-Reset`;
- toda requisição chama `await limiter.take()` antes de sair.

`findTasksInLists` monta `GET /v2/team/{teamId}/task` com `list_ids[]` repetido para cada
Lista, `include_closed=true` e `subtasks=true`, paginando por `page` até vir menos de 100.

- [ ] **Step 4: Rodar e ver passar**

Run: `npm test -- src/lib/clickup/client.test.ts`
Expected: PASS (8 testes).

- [ ] **Step 5: Verificar tipos e commitar**

```bash
npx tsc --noEmit
git add src/lib/clickup/client.ts src/lib/clickup/client.test.ts
git commit -m "feat(clickup): cliente http tipado com rate limit e erros"
```

---

## Fase 4 — Fila e pipeline

### Task 9: Configuração, índice e fila

**Files:**
- Create: `src/lib/clickup/config.ts`, `src/lib/clickup/links.ts`, `src/lib/clickup/queue.ts`
- Test: `src/lib/clickup/queue.test.ts`

**Interfaces:**
- Consumes: `db` (`@/db`), tabelas da Task 1, `computeBackoffMs` (Task 6).
- Produces:
  ```ts
  // config.ts
  export type ProjectConfig = {
    project: Project; spaceId: string; folderId: string; backlogListId: string;
    inProgressStatus: string; doneStatus: string | null;
    sprintDateFormat: SprintDateFormat; enabled: boolean;
  };
  export function getProjectConfig(project: Project): Promise<ProjectConfig | null>;
  export function upsertProjectConfig(input: ProjectConfig, updatedBy: string): Promise<void>;

  // links.ts
  export function findTaskLink(project: Project, normalizedTitle: string):
    Promise<{ clickupTaskId: string; clickupTaskUrl: string; sprintListId: string } | null>;
  export function upsertTaskLink(input: {
    project: Project; normalizedTitle: string;
    clickupTaskId: string; clickupTaskUrl: string; sprintListId: string;
  }): Promise<void>;
  export function deleteTaskLink(project: Project, normalizedTitle: string): Promise<void>;

  // queue.ts
  export function enqueuePushEntry(tx: Transaction, input: {
    entryId: string; kind: "push_entry" | "correction"; moveToReview?: boolean;
  }): Promise<void>;
  export function claimJobs(limit: number): Promise<ClickUpSyncJob[]>;
  export function advanceStage(jobId: string, patch: {
    stage: JobStage; clickupTaskId?: string; clickupCommentId?: string; clickupTimeEntryId?: string;
  }): Promise<void>;
  export function completeJob(jobId: string, entryId: string): Promise<void>;
  export function failJob(jobId: string, err: ClickUpError, maxAttempts: number): Promise<void>;
  export function retryJob(jobId: string): Promise<void>;
  export function countFailedJobs(): Promise<number>;
  ```

- [ ] **Step 1: Escrever o teste que falha (a parte pura da fila)**

Testar a decisão de reagendamento sem tocar no banco, extraindo-a numa função pura:

```ts
import { describe, it, expect } from "vitest";
import { planRetry } from "./queue";
import { ClickUpError } from "./errors";

const recuperavel = new ClickUpError({
  code: "INDISPONIVEL", message: "boom", retryable: true,
});
const terminal = new ClickUpError({
  code: "TOKEN_INVALIDO", message: "token", retryable: false,
});

describe("planRetry", () => {
  it("reagenda erro recuperável com backoff crescente", () => {
    const p = planRetry({ error: recuperavel, attempts: 0, maxAttempts: 5, now: new Date(0) });
    expect(p.status).toBe("pending");
    expect(p.nextRunAt.getTime()).toBe(60_000);
    expect(p.attempts).toBe(1);
  });

  it("desiste ao atingir o teto de tentativas", () => {
    const p = planRetry({ error: recuperavel, attempts: 5, maxAttempts: 5, now: new Date(0) });
    expect(p.status).toBe("failed");
  });

  it("erro terminal falha na hora, sem gastar tentativas", () => {
    const p = planRetry({ error: terminal, attempts: 0, maxAttempts: 5, now: new Date(0) });
    expect(p.status).toBe("failed");
  });

  it("429 espera até o reset e NÃO conta tentativa", () => {
    const reset = new Date(120_000);
    const err = new ClickUpError({
      code: "RATE_LIMIT", message: "limite", retryable: true, resetAt: reset,
    });
    const p = planRetry({ error: err, attempts: 2, maxAttempts: 5, now: new Date(0) });
    expect(p.status).toBe("pending");
    expect(p.nextRunAt).toEqual(reset);
    expect(p.attempts).toBe(2);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm test -- src/lib/clickup/queue.test.ts`
Expected: FAIL — `planRetry` não existe.

- [ ] **Step 3: Implementar os três módulos**

Em `queue.ts`, a parte pura primeiro:

```ts
/**
 * Decide o que fazer com um job que falhou — spec 011, design §5.2.
 *
 * Pura de propósito: é a regra que mais dá bug (contar tentativa a mais, insistir
 * em erro terminal, ignorar o reset do 429) e a que mais barato se testa isolada.
 */
export function planRetry(input: {
  error: ClickUpError;
  attempts: number;
  maxAttempts: number;
  now: Date;
}): { status: "pending" | "failed"; nextRunAt: Date; attempts: number } {
  const { error, attempts, maxAttempts, now } = input;

  if (!error.retryable) {
    return { status: "failed", nextRunAt: now, attempts };
  }

  // Limite de requisições não é culpa do job: espera e não gasta tentativa.
  if (error.code === "RATE_LIMIT" && error.resetAt) {
    return { status: "pending", nextRunAt: error.resetAt, attempts };
  }

  const next = attempts + 1;
  if (next > maxAttempts) {
    return { status: "failed", nextRunAt: now, attempts };
  }
  return {
    status: "pending",
    nextRunAt: new Date(now.getTime() + computeBackoffMs(attempts)),
    attempts: next,
  };
}
```

E a reivindicação concorrente:

```ts
/**
 * Reivindica jobs prontos. `FOR UPDATE SKIP LOCKED` é o que permite mais de um
 * worker sem processar o mesmo job duas vezes — e o que impede um worker travado
 * de bloquear a fila inteira.
 */
export async function claimJobs(limit: number): Promise<ClickUpSyncJob[]> {
  const rows = await db.execute(sql`
    update clickup_sync_jobs
       set status = 'running', updated_at = now()
     where id in (
       select id from clickup_sync_jobs
        where status = 'pending' and next_run_at <= now()
        order by next_run_at
        for update skip locked
        limit ${limit}
     )
    returning *
  `);
  return rows as unknown as ClickUpSyncJob[];
}
```

`enqueuePushEntry` recebe a **transação** como parâmetro — o job precisa nascer junto com
o ponto (`plan.md` §2). `completeJob` marca o job `done` e o registro `synced` na mesma
transação. `failJob` aplica `planRetry` e grava `last_error`.

`config.ts` e `links.ts` são CRUD direto no Drizzle, no molde de `src/lib/ponto/data.ts`.
`upsertTaskLink` usa `onConflictDoUpdate` no índice `(project, normalized_title)`.

- [ ] **Step 4: Rodar e ver passar**

Run: `npm test -- src/lib/clickup/queue.test.ts`
Expected: PASS (4 testes).

- [ ] **Step 5: Commit**

```bash
npx tsc --noEmit
git add src/lib/clickup/config.ts src/lib/clickup/links.ts src/lib/clickup/queue.ts src/lib/clickup/queue.test.ts
git commit -m "feat(clickup): configuracao por projeto, indice de tarefas e fila"
```

---

### Task 10: Pipeline (máquina de estados)

O coração da feature. É aqui que RN-01 a RN-13 viram código.

**Files:**
- Create: `src/lib/clickup/pipeline.ts`
- Test: `src/lib/clickup/pipeline.test.ts`

**Interfaces:**
- Consumes: tudo das Tasks 2–9.
- Produces:
  ```ts
  export type PipelineDeps = {
    client: ClickUpClient;
    getConfig: (project: Project) => Promise<ProjectConfig | null>;
    findLink: typeof findTaskLink;
    upsertLink: typeof upsertTaskLink;
    deleteLink: typeof deleteTaskLink;
    loadEntry: (entryId: string) => Promise<PipelineEntry | null>;
    saveProgress: (jobId: string, patch: StagePatch) => Promise<void>;
    personalToken: (userId: string) => Promise<string | null>;
  };
  export type PipelineEntry = {
    id: string; userId: string; clickupUserId: number | null;
    title: string; workDate: string; workedMinutes: number;
    description: string; project: Project;
  };
  export function runJob(job: ClickUpSyncJob, deps: PipelineDeps): Promise<void>;
  /** Corpo rich text do comentário — a API NÃO aceita markdown (design §4). */
  export function buildCommentBody(entry: PipelineEntry, kind: JobKind): CommentPart[];
  ```
- Também altera `src/lib/clickup/client.ts` (Task 8): `createComment` passa a
  receber `CommentPart[]` e a enviar `{ comment: partes }` no lugar de
  `{ comment_text: markdown }`. O tipo `CommentPart` (`{ text: string;
  attributes?: { bold?: boolean } }`) é exportado pelo client, e o teste de
  `createComment` no `client.test.ts` é atualizado junto.

- [ ] **Step 1: Escrever o teste do comentário (o mais simples primeiro)**

```ts
import { describe, it, expect } from "vitest";
import { buildCommentBody } from "./pipeline";

const entry = {
  id: "e1", userId: "u1", clickupUserId: 7,
  title: "Criar Acessos", workDate: "2026-06-25", workedMinutes: 200,
  description: "Configurei o SSO e testei com dois usuários.",
  project: "labphase" as const,
};

describe("buildCommentBody", () => {
  it("põe data e tempo em negrito de verdade, não markdown", () => {
    const partes = buildCommentBody(entry, "push_entry");
    expect(partes[0]).toEqual({
      text: "25/06/2026 · 3h 20min",
      attributes: { bold: true },
    });
    // Sem asterisco: o ClickUp não interpreta markdown em comentário.
    expect(partes[0].text).not.toContain("*");
  });

  it("manda a descrição como bloco de texto sem atributo", () => {
    const partes = buildCommentBody(entry, "push_entry");
    expect(partes[1].text).toContain("Configurei o SSO");
    expect(partes[1].attributes).toBeUndefined();
  });

  it("marca a correção quando o ponto foi editado — RN-06", () => {
    const partes = buildCommentBody(entry, "correction");
    expect(partes[0].text).toBe("Correção · 25/06/2026 · 3h 20min");
    expect(partes[0].attributes).toEqual({ bold: true });
  });
});
```

- [ ] **Step 2: Escrever o teste do `resolve` com cliente falso**

```ts
import { describe, it, expect, vi } from "vitest";
import { runJob } from "./pipeline";
// ...montar `deps` com vi.fn() para cada método do ClickUpClient.

describe("runJob — etapa resolve", () => {
  it("cria a tarefa quando não existe nada — CA-01", async () => {
    // client.findTasksInLists -> []; findLink -> null
    // espera: createTask chamado 1x com status de andamento e assignee,
    //         upsertLink chamado com o id devolvido.
  });

  it("reusa a tarefa do índice local sem buscar no ClickUp — CA-02", async () => {
    // findLink -> {taskId}; espera: createTask NÃO chamado,
    //                               findTasksInLists NÃO chamado.
  });

  it("adota tarefa que já existia no ClickUp e se atribui — CA-03", async () => {
    // findLink -> null; findTasksInLists -> [task em backlog, sem assignee]
    // espera: createTask NÃO chamado; updateTask chamado com addAssignees
    //         e com o status de andamento.
  });

  it("não mexe no status de tarefa já adiante — CA-04, RN-02", async () => {
    // task com statusType 'custom'
    // espera: updateTask sem campo `status`.
  });

  it("move a tarefa quando a sprint virou — CA-05, RF-17", async () => {
    // findLink -> {sprintListId: 's17'}; destino 's18'
    // espera: moveTaskToList('t1','s18') chamado.
  });

  it("cria tarefa nova quando a anterior está concluída — CA-06, RN-03", async () => {
    // task com statusType 'closed'
    // espera: moveTaskToList NÃO chamado; createTask chamado.
  });

  it("falha terminal sem configuração — CA-14, RN-08", async () => {
    // getConfig -> null; espera: erro com code CONFIG_AUSENTE e retryable false.
  });

  it("falha terminal sem vínculo de membro — CA-15, RN-09", async () => {
    // entry.clickupUserId -> null; espera: code SEM_VINCULO, createTask NÃO chamado.
  });
});

describe("runJob — idempotência (RN-13, CA-12)", () => {
  it("job retomado no stage 'comment' não recria a tarefa", async () => {
    // job.stage = 'comment', job.clickupTaskId = 't1'
    // espera: createTask NÃO chamado; createComment chamado 1x.
  });

  it("job retomado no stage 'time_entry' não recomenta", async () => {
    // espera: createComment NÃO chamado.
  });

  it("job retomado no stage 'finish' não relança tempo", async () => {
    // espera: createTimeEntry NÃO chamado.
  });
});

describe("runJob — etapas finais", () => {
  it("pula o lançamento de tempo sem token pessoal — CA-17, RN-12", async () => {
    // personalToken -> null; espera: createTimeEntry NÃO chamado, job segue para finish.
  });

  it("lança tempo com o token pessoal — CA-16", async () => {
    // personalToken -> 'pk_x'; espera: createTimeEntry chamado com esse token.
  });

  it("só move para conclusão quando pedido e configurado — CA-08, RF-09", async () => {
    // moveToReview=false -> updateTask de status NÃO chamado no finish;
    // moveToReview=true + doneStatus null -> também não;
    // moveToReview=true + doneStatus definido -> chamado.
  });
});
```

Cada `it` acima deve ser escrito por extenso (montando `deps` e afirmando com
`expect(fn).toHaveBeenCalledWith(...)`) — os comentários descrevem exatamente o arranjo e
a asserção esperados.

- [ ] **Step 3: Rodar e ver falhar**

Run: `npm test -- src/lib/clickup/pipeline.test.ts`
Expected: FAIL — módulo inexistente.

- [ ] **Step 4: Implementar o pipeline**

Seguir a máquina de estados de `design.md` §4, à risca. Estrutura:

```ts
export async function runJob(job: ClickUpSyncJob, deps: PipelineDeps): Promise<void> {
  const entry = await deps.loadEntry(job.entryId);
  if (!entry) return; // ponto excluído no meio do caminho — RN-07, nada a fazer

  let stage = job.stage;
  let taskId = job.clickupTaskId;

  if (stage === "resolve") {
    taskId = await resolveTask(job, entry, deps);
    await deps.saveProgress(job.id, { stage: "comment", clickupTaskId: taskId });
    stage = "comment";
  }
  if (stage === "comment") { /* ... saveProgress({stage:'time_entry', clickupCommentId}) */ }
  if (stage === "time_entry") { /* ... saveProgress({stage:'finish', clickupTimeEntryId}) */ }
  if (stage === "finish") { /* ... saveProgress({stage:'done'}) */ }
}
```

**A regra que não pode ser quebrada:** cada `saveProgress` acontece **depois** da chamada
ao ClickUp e **antes** da etapa seguinte. É só isso que impede o retry de duplicar.

`buildCommentBody` usa `formatWorkedMinutes` de `@/lib/ponto/validation` para o tempo e
formata a data como `dd/MM/yyyy` a partir da string `YYYY-MM-DD` (sem `new Date`, para
não sofrer com fuso — mesmo cuidado de `src/lib/ponto/dates.ts`). Devolve duas partes: o
cabeçalho com `attributes: { bold: true }` e a descrição sem atributo, precedida de
`\n\n`. **Nada de asterisco** — quem dá o negrito é o atributo, não markdown.

- [ ] **Step 5: Rodar e ver passar**

Run: `npm test -- src/lib/clickup/pipeline.test.ts`
Expected: PASS (todos os casos acima).

- [ ] **Step 6: Rodar a suíte inteira e commitar**

```bash
npm test
npx tsc --noEmit
git add src/lib/clickup/pipeline.ts src/lib/clickup/pipeline.test.ts
git commit -m "feat(clickup): pipeline por etapas com retomada idempotente"
```

---

## Fase 5 — Gatilhos

### Task 11: Enfileirar a partir do ponto e do cronômetro

**Files:**
- Modify: `src/lib/ponto/actions.ts` (`createEntry`, `updateEntry`, `duplicateEntry`)
- Modify: `src/lib/tracking/actions.ts` (`finalizeTracking`)
- Modify: `src/lib/tracking/validation.ts` (campo `moveToReview`)
- Create: `src/lib/clickup/enabled.ts`
- Test: `src/lib/clickup/enabled.test.ts`

**Interfaces:**
- Consumes: `enqueuePushEntry` (Task 9).
- Produces: `isSyncEnabled(): boolean`, `initialSyncStatus(): "pending" | "off"`

- [ ] **Step 1: Escrever o teste da chave geral**

```ts
import { describe, it, expect, afterEach } from "vitest";
import { isSyncEnabled, initialSyncStatus } from "./enabled";

const original = { ...process.env };
afterEach(() => { process.env = { ...original }; });

describe("isSyncEnabled", () => {
  it("desligada sem token de serviço", () => {
    delete process.env.CLICKUP_API_TOKEN;
    expect(isSyncEnabled()).toBe(false);
  });

  it("desligada quando CLICKUP_SYNC_ENABLED=false", () => {
    process.env.CLICKUP_API_TOKEN = "pk_x";
    process.env.CLICKUP_TEAM_ID = "1";
    process.env.CLICKUP_SYNC_ENABLED = "false";
    expect(isSyncEnabled()).toBe(false);
  });

  it("ligada com token e team id", () => {
    process.env.CLICKUP_API_TOKEN = "pk_x";
    process.env.CLICKUP_TEAM_ID = "1";
    delete process.env.CLICKUP_SYNC_ENABLED;
    expect(isSyncEnabled()).toBe(true);
  });

  it("registro nasce 'off' com a integração desligada", () => {
    delete process.env.CLICKUP_API_TOKEN;
    expect(initialSyncStatus()).toBe("off");
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm test -- src/lib/clickup/enabled.test.ts`
Expected: FAIL — módulo inexistente.

- [ ] **Step 3: Implementar `enabled.ts` e ligar os gatilhos**

Em `createEntry`, trocar o `db.insert(...)` solto por uma transação que insere os
registros **e** enfileira um job por registro:

```ts
  const syncOn = isSyncEnabled();
  const rowsWithStatus = rows.map((r) => ({
    ...r,
    clickupSyncStatus: initialSyncStatus(),
  }));

  await db.transaction(async (tx) => {
    const created = await tx
      .insert(registrosPonto)
      .values(rowsWithStatus)
      .returning({ id: registrosPonto.id });

    // O job nasce na MESMA transação do ponto: ou os dois existem, ou nenhum.
    if (syncOn) {
      for (const { id } of created) {
        await enqueuePushEntry(tx, { entryId: id, kind: "push_entry" });
      }
    }
  });
```

Em `updateEntry`, após a atualização bem-sucedida: se o registro já tem
`clickup_task_id`, enfileirar `correction`; se não tem e está `pending`/`failed`,
enfileirar `push_entry` (**RN-06**).

Em `duplicateEntry`, mesmo tratamento de `createEntry` (é uma criação).

Em `deleteEntry`, **nada muda** — o `ON DELETE CASCADE` já cuida (**RN-07**).

Em `finalizeTracking`, aceitar `moveToReview` no schema e marcar apenas o **último** job:

```ts
    const created = await tx.insert(registrosPonto).values(rows)
      .returning({ id: registrosPonto.id });

    if (syncOn) {
      for (let i = 0; i < created.length; i++) {
        await enqueuePushEntry(tx, {
          entryId: created[i].id,
          kind: "push_entry",
          // Só o último segmento fecha a tarefa — RF-09/RN-04.
          moveToReview: moveToReview && i === created.length - 1,
        });
      }
    }
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npm test`
Expected: PASS — inclusive os testes já existentes de ponto e tracking.

- [ ] **Step 5: Commit**

```bash
npx tsc --noEmit
git add src/lib/clickup/enabled.ts src/lib/clickup/enabled.test.ts src/lib/ponto/actions.ts src/lib/tracking/actions.ts src/lib/tracking/validation.ts
git commit -m "feat(clickup): enfileirar sincronizacao ao registrar ponto"
```

---

## Fase 6 — Worker

### Task 12: Processo do worker e serviço no compose

**Files:**
- Create: `src/worker/clickup-sync.ts`
- Modify: `package.json` (script `worker:clickup`)
- Modify: `docker-compose.yml` (serviço `worker`)
- Modify: `.env.example`

- [ ] **Step 1: Escrever o entrypoint**

```ts
/**
 * Worker de sincronização com o ClickUp — spec 011, plan §2.
 *
 * Roda em container próprio (estágio `tools` do Dockerfile, que já tem tsx e o
 * código-fonte). É de propósito BURRO: reivindica job, chama o pipeline, grava o
 * resultado. Toda a regra vive em `src/lib/clickup/pipeline.ts`.
 */
import { createClickUpClient } from "@/lib/clickup/client";
import { claimJobs, completeJob, failJob, advanceStage } from "@/lib/clickup/queue";
import { runJob } from "@/lib/clickup/pipeline";
// ...demais dependências do PipelineDeps

const POLL_MS = Number(process.env.CLICKUP_WORKER_POLL_MS ?? 5000);
const MAX_ATTEMPTS = Number(process.env.CLICKUP_MAX_ATTEMPTS ?? 5);
const BATCH = 10;

let parando = false;
for (const sinal of ["SIGTERM", "SIGINT"] as const) {
  process.on(sinal, () => {
    console.log(`[clickup-worker] ${sinal} recebido, encerrando após o lote atual.`);
    parando = true;
  });
}

async function main() {
  const token = process.env.CLICKUP_API_TOKEN;
  const teamId = process.env.CLICKUP_TEAM_ID;
  if (!token || !teamId) {
    console.log("[clickup-worker] sem CLICKUP_API_TOKEN/CLICKUP_TEAM_ID — nada a fazer.");
    return;
  }

  const client = createClickUpClient({
    token,
    teamId,
    perMinute: Number(process.env.CLICKUP_RATE_LIMIT_PER_MIN ?? 90),
  });

  console.log("[clickup-worker] iniciado.");
  while (!parando) {
    const jobs = await claimJobs(BATCH);
    if (jobs.length === 0) {
      await new Promise((r) => setTimeout(r, POLL_MS));
      continue;
    }
    for (const job of jobs) {
      try {
        await runJob(job, deps);
        await completeJob(job.id, job.entryId);
      } catch (err) {
        // Nunca derruba o laço: um job ruim não pode parar a fila.
        await failJob(job.id, toClickUpError(err), MAX_ATTEMPTS);
      }
    }
  }
  console.log("[clickup-worker] encerrado.");
  process.exit(0);
}

main().catch((err) => {
  console.error("[clickup-worker] falha fatal:", err);
  process.exit(1);
});
```

- [ ] **Step 2: Adicionar o script no `package.json`**

```json
    "worker:clickup": "tsx src/worker/clickup-sync.ts",
```

- [ ] **Step 3: Adicionar o serviço no `docker-compose.yml`**

Após o serviço `app`:

```yaml
  # Worker da integração com o ClickUp (spec 011). Consome `clickup_sync_jobs`.
  # Usa o estágio `tools` porque precisa de tsx + código-fonte (o `runner` só tem
  # o build standalone da app). Sem CLICKUP_API_TOKEN ele encerra sozinho.
  worker:
    build:
      context: .
      dockerfile: Dockerfile
      target: tools
    container_name: controlbio-ponto-worker
    restart: unless-stopped
    depends_on:
      db:
        condition: service_healthy
      migrate:
        condition: service_completed_successfully
    command: ["npm", "run", "worker:clickup"]
    environment:
      NODE_ENV: production
      DATABASE_URL: postgresql://${POSTGRES_USER:-controlbio}:${POSTGRES_PASSWORD:-controlbio}@db:5432/${POSTGRES_DB:-controlbio_ponto}
      CLICKUP_API_TOKEN: ${CLICKUP_API_TOKEN:-}
      CLICKUP_TEAM_ID: ${CLICKUP_TEAM_ID:-}
      CLICKUP_TOKEN_ENC_KEY: ${CLICKUP_TOKEN_ENC_KEY:-}
      CLICKUP_RATE_LIMIT_PER_MIN: ${CLICKUP_RATE_LIMIT_PER_MIN:-90}
      CLICKUP_WORKER_POLL_MS: ${CLICKUP_WORKER_POLL_MS:-5000}
      CLICKUP_MAX_ATTEMPTS: ${CLICKUP_MAX_ATTEMPTS:-5}
```

Adicionar as mesmas variáveis (menos as de worker) ao serviço `app`, que precisa delas
para as telas de configuração.

- [ ] **Step 4: Documentar as variáveis no `.env.example`**

Seção nova ao fim, com comentário explicando cada uma e **como gerar a chave**:

```bash
# Gere com:  node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
CLICKUP_TOKEN_ENC_KEY=
```

- [ ] **Step 5: Verificar que sobe e encerra limpo**

```bash
docker compose up -d --build worker
docker compose logs worker
```

Expected: sem `CLICKUP_API_TOKEN`, log "sem CLICKUP_API_TOKEN/CLICKUP_TEAM_ID — nada a fazer."
e saída limpa. Com token, log "iniciado."

- [ ] **Step 6: Commit**

```bash
git add src/worker/clickup-sync.ts package.json docker-compose.yml .env.example
git commit -m "feat(clickup): worker de sincronizacao no compose"
```

---

## Fase 7 — Telas

> As tarefas de UI seguem padrões que **já existem** no repositório. Cada uma aponta o
> arquivo de referência a copiar — é mais confiável que reescrever o padrão aqui e
> arriscar divergir dele.

### Task 13: Tela `/integracao` (admin)

**Files:**
- Create: `src/app/(app)/integracao/page.tsx`, `integracao-client.tsx`, `project-config-form.tsx`
- Create: `src/lib/clickup/validation.ts`, `src/lib/clickup/actions.ts`, `src/lib/clickup/data.ts`
- Test: `src/lib/clickup/validation.test.ts`
- Modify: `src/components/app-sidebar.tsx`

**Referências de padrão:** `src/app/(app)/usuarios/page.tsx` (Server Component com guarda),
`usuarios-client.tsx` (client + React Query), `user-form.tsx` (RHF + Zod + Server Action).

- [ ] **Step 1: Escrever o teste do schema de configuração**

```ts
import { describe, it, expect } from "vitest";
import { projectConfigSchema } from "./validation";

const valido = {
  project: "labphase", spaceId: "901310643075", folderId: "90132809457",
  backlogListId: "901322890308", inProgressStatus: "fazendo",
  doneStatus: "homologando", sprintDateFormat: "mdy", enabled: true,
};

describe("projectConfigSchema", () => {
  it("aceita configuração completa", () => {
    expect(projectConfigSchema.safeParse(valido).success).toBe(true);
  });

  it("exige folder e backlog", () => {
    expect(projectConfigSchema.safeParse({ ...valido, folderId: "" }).success).toBe(false);
    expect(projectConfigSchema.safeParse({ ...valido, backlogListId: "" }).success).toBe(false);
  });

  it("exige status de andamento", () => {
    expect(projectConfigSchema.safeParse({ ...valido, inProgressStatus: "" }).success).toBe(false);
  });

  it("aceita status de conclusão vazio (opcional)", () => {
    expect(projectConfigSchema.safeParse({ ...valido, doneStatus: "" }).success).toBe(true);
  });

  it("só aceita dmy ou mdy como formato de data", () => {
    expect(projectConfigSchema.safeParse({ ...valido, sprintDateFormat: "ymd" }).success).toBe(false);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm test -- src/lib/clickup/validation.test.ts`
Expected: FAIL — módulo inexistente.

- [ ] **Step 3: Implementar schema, actions e tela**

`actions.ts` expõe, todas com `requirePermission("integracao:configurar")`:
`fetchConnectionStatus()`, `fetchSpaces()`, `fetchFolders(spaceId)`, `fetchLists(folderId)`,
`fetchListStatuses(listId)`, `saveProjectConfig(input)` (revalida o schema no servidor) e
`testProjectConfig(project)` — que roda `pickSprintList` com a data de hoje e devolve o
nome da Lista escolhida e a `source` (**RF-19**, CA-13).

A tela: cabeçalho de conexão, um card por projeto com os selects encadeados, botão testar
e o contador de pendências (`countFailedJobs`). Mobile first, cards empilhados.

Na `app-sidebar`, entrada nova condicionada à permissão, no mesmo molde de `/usuarios`:

```tsx
    ...(canConfigurarIntegracao
      ? [{ href: "/integracao", label: "Integração", icon: Plug }]
      : []),
```

- [ ] **Step 4: Rodar, verificar em 360px e commitar**

```bash
npm test && npx tsc --noEmit && npm run lint
git add src/app/\(app\)/integracao src/lib/clickup/validation.ts src/lib/clickup/validation.test.ts src/lib/clickup/actions.ts src/lib/clickup/data.ts src/components/app-sidebar.tsx
git commit -m "feat(clickup): tela de configuracao da integracao"
```

---

### Task 14: Vínculo do usuário com o membro do ClickUp

**Files:**
- Modify: `src/app/(app)/usuarios/user-form.tsx`
- Modify: `src/lib/usuarios/validation.ts` e a action de salvar usuário
- Create: `src/lib/clickup/members.ts`

- [ ] **Step 1: Implementar `members.ts`**

`listMembers()` chama `GET /v2/team` e devolve `{ id, username, email }[]`.
`suggestMemberFor(user, members)` casa por e-mail exato e, na falta, por
`normalizeTitle(nome)` — a sugestão que o formulário pré-seleciona (**RF-12**).

- [ ] **Step 2: Adicionar o campo no formulário**

Select com busca sobre os membros (React Query), pré-selecionado pela sugestão, gravando
`clickup_user_id`. Campo opcional: usuário sem vínculo simplesmente não sincroniza (RN-09).

- [ ] **Step 3: Verificar e commitar**

```bash
npm test && npx tsc --noEmit
git add src/lib/clickup/members.ts src/app/\(app\)/usuarios src/lib/usuarios
git commit -m "feat(clickup): vincular usuario ao membro do workspace"
```

---

### Task 15: Seção ClickUp em Minha conta

**Files:**
- Create: `src/components/conta-clickup.tsx`
- Modify: `src/components/conta-modal.tsx`
- Modify: `src/lib/conta/actions.ts`, `src/lib/conta/validation.ts`

**Referência de padrão:** `src/components/conta-form.tsx`.

- [ ] **Step 1: Actions de conectar/desconectar**

`connectClickUp(token)`: valida o formato (`pk_`), chama `GET /v2/user` **com o token
informado** para provar que é válido, cifra com `encryptToken` e grava junto com o rótulo
(`username` devolvido). `disconnectClickUp()` zera as duas colunas.

**Nunca** devolver o token ao client — a leitura expõe só `clickupTokenLabel`.

- [ ] **Step 2: Componente da seção**

Input `type="password"`, botões conectar/desconectar, estado "conectado como X".
Duas linhas de texto: o que o token habilita, e o aviso de que a descrição do ponto vai
para o ClickUp (**RNF de privacidade**).

- [ ] **Step 3: Verificar e commitar**

```bash
npm test && npx tsc --noEmit
git add src/components/conta-clickup.tsx src/components/conta-modal.tsx src/lib/conta
git commit -m "feat(clickup): conectar conta pessoal em minha conta"
```

---

### Task 16: Estado de sincronização no card do ponto

**Files:**
- Modify: `src/app/(app)/ponto/ponto-entry-card.tsx`
- Modify: `src/lib/ponto/data.ts` (expor os campos novos em `PontoEntry`)
- Modify: `src/lib/clickup/actions.ts` (`retryEntrySync`)
- Create: `src/app/(app)/ponto/clickup-sync-badge.tsx`

- [ ] **Step 1: Expor os campos na leitura**

Acrescentar `clickupTaskId`, `clickupTaskUrl` e `clickupSyncStatus` ao `select` de
`listOwnEntries` e ao tipo `PontoEntry`.

- [ ] **Step 2: Criar o badge**

Conforme `design.md` §6.4. `AnimatePresence` do `motion` na troca de estado. No mobile
só o ícone, mantendo alvo de 44 px. `off` não renderiza nada.

- [ ] **Step 3: Ação de reenviar**

`retryEntrySync(entryId)`: exige `ponto:registrar`, confere que o registro é **do próprio
usuário** (mesma proteção de `updateEntry`) e chama `retryJob` (**RF-14**).

- [ ] **Step 4: Verificar em 360px e commitar**

```bash
npm test && npx tsc --noEmit && npm run lint
git add src/app/\(app\)/ponto src/lib/ponto/data.ts src/lib/clickup/actions.ts
git commit -m "feat(clickup): estado de sincronizacao e reenvio no card do ponto"
```

---

### Task 17: Interruptor de revisão no encerramento do cronômetro

**Files:**
- Modify: `src/app/(app)/tracking-finalize-dialog.tsx`

- [ ] **Step 1: Adicionar o campo**

Interruptor **"mover a tarefa para revisão"**, marcado por padrão, exibido **apenas**
quando o projeto do tracking tem `doneStatus` configurado. Integra no RHF já existente do
modal e vai para `finalizeTracking` como `moveToReview` (Task 11).

Texto de apoio, uma linha: "desmarque se você só está parando por hoje" — é a proteção
contra marcar como pronta uma tarefa que só foi interrompida.

- [ ] **Step 2: Verificar e commitar**

```bash
npm test && npx tsc --noEmit
git add src/app/\(app\)/tracking-finalize-dialog.tsx
git commit -m "feat(clickup): opcao de mover tarefa para revisao ao encerrar"
```

---

## Fase 8 — Documentação

### Task 18: Fechar a documentação

**Files:**
- Modify: `docs/design-system.md`
- Modify: `docs/deploy.md`
- Modify: `CLAUDE.md` (comandos úteis)
- Write: `docs/specs/011-integracao-clickup/acceptance.md`
- Modify: `docs/specs/011-integracao-clickup/spec.md` (status e questões resolvidas)

- [ ] **Step 1: Design system**

Registrar o padrão visual do **badge de estado de sincronização** (os quatro estados, os
tokens usados, a animação de transição) na seção de componentes, com bump de versão/data —
exigência do `CLAUDE.md` §5.

- [ ] **Step 2: Deploy**

Seção nova sobre o serviço `worker`: para que serve, como ver os logs
(`docker compose logs -f worker`), como gerar a `CLICKUP_TOKEN_ENC_KEY`, e o aviso de que
**perder essa chave invalida todos os tokens pessoais** (as pessoas precisam reconectar).

- [ ] **Step 3: Roteiro de aceitação**

Preencher `acceptance.md` com um caso por critério de aceitação da spec (CA-01 a CA-23),
em passo a passo executável contra o `Espaço Teste` do workspace.

- [ ] **Step 4: Fechar a spec**

Marcar os CA verificados, responder as questões Q-01 a Q-06 com o que a implementação
apurou, e mudar o status para **Implementada**.

- [ ] **Step 5: Commit**

```bash
git add docs/
git commit -m "docs(clickup): design system, deploy e roteiro de aceitacao"
```

---

## Auto-revisão do plano

**Cobertura da spec** — cada requisito tem tarefa:

| Requisito              | Tarefa                        |
| ---------------------- | ----------------------------- |
| RF-01, RF-15, RF-16    | 9, 11, 12                     |
| RF-02, RF-03, RF-04    | 10                            |
| RF-05                  | 10                            |
| RF-06, RF-07           | 3, 10                         |
| RF-08                  | 4, 10                         |
| RF-09                  | 10, 11, 17                    |
| RF-10, RF-11, RF-20    | 9, 13                         |
| RF-12                  | 14                            |
| RF-13                  | 16                            |
| RF-14                  | 16                            |
| RF-17                  | 10                            |
| RF-18                  | 5, 10, 15                     |
| RF-19                  | 13                            |
| RN-01                  | 2, 10                         |
| RN-02, RN-03           | 4, 10                         |
| RN-04, RN-05           | 11, 17                        |
| RN-06, RN-07           | 11                            |
| RN-08, RN-09           | 10                            |
| RN-10                  | 10 (nunca escreve estimativa) |
| RN-11                  | — (nada muda em relatórios)   |
| RN-12                  | 10, 15                        |
| RN-13                  | 10 (testes de idempotência)   |
| RN-14                  | 11 (actions escopadas por dono) |
| RNF segurança          | 5, 15                         |
| RNF limite externo     | 7, 8                          |
| RNF privacidade        | 15                            |
| RNF observabilidade    | 13, 16                        |
| RNF acesso             | 1, 13                         |
| RNF responsividade     | 13, 15, 16, 17                |

**Consistência de tipos:** `ClickUpList` (Task 3) é consumido por `client.getLists`
(Task 8) e `pickSprintList` (Task 10). `ClickUpStatus` (Task 4) por
`client.getListStatuses`. `ClickUpError` (Task 6) por `client` (8), `planRetry` (9) e
`pipeline` (10). `normalizeTitle` (Task 2) por `status.findStatusByName` (4),
`links` (9), `pipeline` (10) e `members.suggestMemberFor` (14). `Project` vem de
`@/lib/ponto/validation` em todos.

**Ponto de atenção deixado de propósito:** a Task 8 (`client.ts`) e as Tasks 13–17 (UI)
descrevem contratos e travam o comportamento por teste, mas não trazem o corpo inteiro da
implementação — são código de padrão já estabelecido no repositório, e apontar o arquivo
de referência é mais confiável do que reescrever o padrão aqui e arriscar divergir dele.
Toda decisão que **não** é óbvia a partir do padrão está escrita.

**Verificação bloqueante antes da Fase 4:** confirmar Q-01 (se as Listas de sprint têm
`start_date`/`due_date` preenchidos) chamando `GET /v2/folder/{id}/list` com o token real.
O resultado não muda o código — muda quanto se pode confiar no caminho principal contra a
rede de segurança.
