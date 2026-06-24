import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { registrosPonto } from "@/db/schema";

export type PontoEntry = {
  id: string;
  workDate: string;
  workedMinutes: number;
  description: string;
  createdAt: Date;
};

/**
 * Lista os registros de ponto do próprio usuário, mais recentes primeiro.
 * Sempre filtra por dono (RF-05) — quem chama passa o id do usuário autenticado.
 */
export async function listOwnEntries(userId: string): Promise<PontoEntry[]> {
  return db
    .select({
      id: registrosPonto.id,
      workDate: registrosPonto.workDate,
      workedMinutes: registrosPonto.workedMinutes,
      description: registrosPonto.description,
      createdAt: registrosPonto.createdAt,
    })
    .from(registrosPonto)
    .where(eq(registrosPonto.userId, userId))
    .orderBy(desc(registrosPonto.workDate), desc(registrosPonto.createdAt));
}
