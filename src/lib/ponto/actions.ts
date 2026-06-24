"use server";

import { redirect } from "next/navigation";
import { db } from "@/db";
import { registrosPonto } from "@/db/schema";
import { requirePermission } from "@/lib/auth/guard";
import { createEntrySchema } from "./validation";

export type PontoActionState = {
  error?: string;
  fieldErrors?: Record<string, string>;
};

/**
 * Cria um registro de ponto para o usuário autenticado.
 * RN-05: o dono é SEMPRE o usuário da sessão (nunca um id vindo do cliente).
 */
export async function createEntry(
  _prev: PontoActionState,
  formData: FormData,
): Promise<PontoActionState> {
  const user = await requirePermission("ponto:registrar");

  const parsed = createEntrySchema.safeParse({
    workDate: formData.get("workDate"),
    hours: formData.get("hours"),
    minutes: formData.get("minutes"),
    description: formData.get("description"),
  });

  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const field = issue.path[0];
      if (typeof field === "string" && !fieldErrors[field]) {
        fieldErrors[field] = issue.message;
      }
    }
    return { fieldErrors };
  }

  const { workDate, hours, minutes, description } = parsed.data;

  await db.insert(registrosPonto).values({
    userId: user.id,
    workDate,
    workedMinutes: hours * 60 + minutes,
    description,
  });

  redirect("/ponto?ok=registrado");
}
