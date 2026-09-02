"use server";

import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { registrosPonto } from "@/db/schema";
import { requirePermission } from "@/lib/auth/guard";
import { initialSyncStatus, isSyncEnabled } from "@/lib/clickup/enabled";
import { enqueuePushEntry } from "@/lib/clickup/queue";
import { createEntrySchema, updateEntrySchema } from "./validation";
import {
  listOwnEntries,
  listEntriesByUsers,
  type DateRange,
  type PontoEntry,
  type TeamEntry,
} from "./data";

/**
 * Leitura dos registros do próprio usuário (opcionalmente por intervalo) para o
 * client (React Query). Guarda no servidor: exige `ponto:ver_proprio`.
 */
export async function fetchOwnEntries(
  range?: DateRange,
): Promise<PontoEntry[]> {
  const user = await requirePermission("ponto:ver_proprio");
  return listOwnEntries(user.id, range);
}

/**
 * Leitura dos registros de **vários** usuários (visão de equipe do admin, spec
 * 007). Guarda no servidor: exige `ponto:ver_equipe`. Somente leitura — não há
 * action para criar/editar/excluir ponto de outro usuário.
 */
export async function fetchEntriesByUsers(
  userIds: string[],
  range: DateRange,
): Promise<TeamEntry[]> {
  await requirePermission("ponto:ver_equipe");

  const ids = (Array.isArray(userIds) ? userIds : []).filter(
    (id): id is string => typeof id === "string" && id.length > 0,
  );

  return listEntriesByUsers(ids, range);
}

export type PontoActionState = {
  ok?: boolean;
  error?: string;
  fieldErrors?: Record<string, string>;
  /** Quantos registros foram criados (split em vários dias). */
  created?: number;
};

const DAY_MINUTES = 1440;

/** Soma `days` dias a uma data "YYYY-MM-DD" (em horário local) e devolve ISO. */
function addDaysISO(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  date.setDate(date.getDate() + days);
  const yy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

/** Extrai erros por campo de um ZodError (primeiro erro de cada campo). */
function collectFieldErrors(
  issues: { path: PropertyKey[]; message: string }[],
): Record<string, string> {
  const fieldErrors: Record<string, string> = {};
  for (const issue of issues) {
    const field = issue.path[0];
    if (typeof field === "string" && !fieldErrors[field]) {
      fieldErrors[field] = issue.message;
    }
  }
  return fieldErrors;
}

/**
 * Cria registro(s) de ponto para o usuário autenticado.
 * RN-05: o dono é SEMPRE o usuário da sessão (nunca um id vindo do cliente).
 *
 * Se o tempo passar de 24h, **distribui** em vários dias (máx. 24h/dia) a partir
 * do dia escolhido — um registro por dia, todos com o mesmo título/descrição/link
 * (os dias gerados podem cair no futuro). Revalida no servidor — nunca confiar no client.
 */
export async function createEntry(input: unknown): Promise<PontoActionState> {
  const user = await requirePermission("ponto:registrar");

  const parsed = createEntrySchema.safeParse(input);
  if (!parsed.success) {
    return { fieldErrors: collectFieldErrors(parsed.error.issues) };
  }

  const { title, workDate, hours, minutes, description, link, project } = parsed.data;
  const linkValue = link && link.length > 0 ? link : null;
  const totalMinutes = hours * 60 + minutes;

  // Fatia em dias de no máximo 24h, a partir de `workDate`.
  const rows: (typeof registrosPonto.$inferInsert)[] = [];
  let remaining = totalMinutes;
  let dayOffset = 0;
  while (remaining > 0) {
    const dayMinutes = Math.min(remaining, DAY_MINUTES);
    rows.push({
      userId: user.id,
      title,
      workDate: addDaysISO(workDate, dayOffset),
      workedMinutes: dayMinutes,
      description,
      link: linkValue,
      project,
      clickupSyncStatus: initialSyncStatus(),
    });
    remaining -= dayMinutes;
    dayOffset += 1;
  }

  const syncOn = isSyncEnabled();

  // O job nasce na MESMA transação do ponto: ou os dois existem, ou nenhum.
  // Se caísse entre salvar o ponto e enfileirar o job em transações separadas,
  // um crash no meio perderia a sincronização silenciosamente, sem rastro.
  await db.transaction(async (tx) => {
    const created = await tx
      .insert(registrosPonto)
      .values(rows)
      .returning({ id: registrosPonto.id });

    if (syncOn) {
      for (const { id } of created) {
        await enqueuePushEntry(tx, { entryId: id, kind: "push_entry" });
      }
    }
  });

  return { ok: true, created: rows.length };
}

/**
 * Edita um registro de ponto do próprio usuário.
 * Segurança: a atualização só atinge a linha cujo `user_id` é o da sessão
 * (RN-05) — ninguém edita registro de outro, mesmo passando um id qualquer.
 */
export async function updateEntry(
  id: string,
  input: unknown,
): Promise<PontoActionState> {
  const user = await requirePermission("ponto:editar");

  if (typeof id !== "string" || !id) {
    return { error: "Registro inválido." };
  }

  const parsed = updateEntrySchema.safeParse(input);
  if (!parsed.success) {
    return { fieldErrors: collectFieldErrors(parsed.error.issues) };
  }

  const { title, workDate, hours, minutes, description, link, project } = parsed.data;
  const syncOn = isSyncEnabled();

  // Atualização e enfileiramento na MESMA transação, pelo mesmo motivo do
  // `createEntry`: se caíssem em transações separadas, um crash entre as duas
  // deixaria a edição salva sem o job correspondente, sem deixar rastro.
  const row = await db.transaction(async (tx) => {
    const updated = await tx
      .update(registrosPonto)
      .set({
        title,
        workDate,
        workedMinutes: hours * 60 + minutes,
        description,
        link: link && link.length > 0 ? link : null,
        project,
      })
      .where(and(eq(registrosPonto.id, id), eq(registrosPonto.userId, user.id)))
      .returning({
        id: registrosPonto.id,
        clickupSyncStatus: registrosPonto.clickupSyncStatus,
      });

    const found = updated[0];
    if (!found) return null;

    // RN-06: um registro já sincronizado nunca é reescrito — a edição vira
    // um comentário de correção na tarefa. Se ainda não chegou lá, tenta o
    // envio inicial de novo (pending/failed); se nasceu com a integração
    // desligada (`off`), não enfileira nada. A chave geral (`isSyncEnabled`)
    // é absoluta: com a integração desligada, editar não pode reativar a
    // sincronização de um registro nem enfileirar nada — mesma regra de
    // `createEntry`/`duplicateEntry`/`finalizeTracking`.
    //
    // O que decide entre correção e envio inicial é `clickupSyncStatus`, NÃO
    // `clickupTaskId`: o id da tarefa é marcador de PROGRESSO, gravado ao fim
    // do `resolve`, antes de existir comentário nenhum. Um job que resolveu e
    // falhou de forma terminal no `comment` deixa o id gravado; tratar isso
    // como "já sincronizado" enfileiraria uma `correction`, que pula o
    // lançamento de tempo por definição — a tarefa receberia como PRIMEIRO
    // comentário um rotulado "Correção", o tempo nunca seria lançado (RF-18,
    // CA-16) e o registro ainda terminaria `synced`, com o badge verde
    // escondendo tudo.
    if (syncOn) {
      if (found.clickupSyncStatus === "synced") {
        await enqueuePushEntry(tx, { entryId: found.id, kind: "correction" });
      } else if (
        found.clickupSyncStatus === "pending" ||
        found.clickupSyncStatus === "failed"
      ) {
        await enqueuePushEntry(tx, { entryId: found.id, kind: "push_entry" });

        // O envio voltou para a fila: o registro é `pending` de novo — mesma
        // verdade imediata que `retryJob` grava (RF-14). Sem isto o card
        // continua oferecendo "reenviar", que reagendaria o job ANTIGO em
        // paralelo com este — dois jobs vivos no mesmo ponto, dois comentários.
        if (found.clickupSyncStatus === "failed") {
          await tx
            .update(registrosPonto)
            .set({ clickupSyncStatus: "pending" })
            .where(eq(registrosPonto.id, found.id));
        }
      }
    }

    return found;
  });

  if (!row) {
    return { error: "Registro não encontrado." };
  }

  return { ok: true };
}

/**
 * Duplica um registro de ponto do próprio usuário: cria uma **cópia exata**
 * (mesmo título, dia, tempo, descrição e link) — spec 009.
 * Segurança: só duplica registro cujo dono é o usuário da sessão (RN-05); o
 * dono da cópia é sempre a sessão. Exige `ponto:registrar` (é uma criação).
 */
export async function duplicateEntry(id: string): Promise<PontoActionState> {
  const user = await requirePermission("ponto:registrar");

  if (typeof id !== "string" || !id) {
    return { error: "Registro inválido." };
  }

  const found = await db
    .select({
      title: registrosPonto.title,
      workDate: registrosPonto.workDate,
      workedMinutes: registrosPonto.workedMinutes,
      description: registrosPonto.description,
      link: registrosPonto.link,
      project: registrosPonto.project,
    })
    .from(registrosPonto)
    .where(and(eq(registrosPonto.id, id), eq(registrosPonto.userId, user.id)))
    .limit(1);

  const original = found[0];
  if (!original) {
    return { error: "Registro não encontrado." };
  }

  const syncOn = isSyncEnabled();

  // Mesmo tratamento de `createEntry`: é uma criação — job nasce junto com o
  // registro, na mesma transação.
  await db.transaction(async (tx) => {
    const [created] = await tx
      .insert(registrosPonto)
      .values({
        userId: user.id,
        title: original.title,
        workDate: original.workDate,
        workedMinutes: original.workedMinutes,
        description: original.description,
        link: original.link,
        project: original.project,
        clickupSyncStatus: initialSyncStatus(),
      })
      .returning({ id: registrosPonto.id });

    if (syncOn) {
      await enqueuePushEntry(tx, { entryId: created.id, kind: "push_entry" });
    }
  });

  return { ok: true, created: 1 };
}

/**
 * Exclui um registro de ponto do próprio usuário.
 * Segurança: a exclusão é escopada por dono (RN-05).
 */
export async function deleteEntry(id: string): Promise<void> {
  const user = await requirePermission("ponto:excluir");
  if (!id) return;

  await db
    .delete(registrosPonto)
    .where(and(eq(registrosPonto.id, id), eq(registrosPonto.userId, user.id)));
}
