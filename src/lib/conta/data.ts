import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";

/**
 * Lê só o RÓTULO da conexão pessoal com o ClickUp (spec 011, Tarefa 15) — nunca
 * o token cifrado. Consulta separada de propósito: `SessionUser`/`getCurrentUser()`
 * é usado em praticamente toda a área logada (RBAC incluso), então não é o
 * lugar de pendurar mais uma coluna. "Minha conta" é a única tela que precisa
 * saber "conectado como X" e busca isso à parte.
 */
export async function getClickUpLabel(userId: string): Promise<string | null> {
  const rows = await db
    .select({ clickupTokenLabel: users.clickupTokenLabel })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  return rows[0]?.clickupTokenLabel ?? null;
}
