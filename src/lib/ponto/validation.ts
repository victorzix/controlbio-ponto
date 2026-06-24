import { z } from "zod";

/** Data de hoje (horário local do servidor) como YYYY-MM-DD. */
export function todayISODate(): string {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

/** Validação do registro de ponto. Ver design §3/§6. */
export const createEntrySchema = z
  .object({
    workDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Informe um dia válido."),
    hours: z.coerce
      .number()
      .int("Horas inválidas.")
      .min(0, "Horas inválidas.")
      .max(24, "Horas inválidas."),
    minutes: z.coerce
      .number()
      .int("Minutos inválidos.")
      .min(0, "Minutos inválidos.")
      .max(59, "Minutos inválidos."),
    description: z
      .string()
      .trim()
      .min(1, "Informe a descrição.")
      .max(5000, "Descrição muito longa (máx. 5000 caracteres)."),
  })
  .refine((v) => v.hours * 60 + v.minutes >= 1, {
    message: "Informe um tempo trabalhado maior que zero.",
    path: ["minutes"],
  })
  .refine((v) => v.hours * 60 + v.minutes <= 1440, {
    message: "O tempo trabalhado não pode passar de 24h.",
    path: ["hours"],
  })
  .refine((v) => v.workDate <= todayISODate(), {
    message: "O dia não pode ser no futuro.",
    path: ["workDate"],
  });

export type CreateEntryInput = z.infer<typeof createEntrySchema>;

/** Formata minutos como "Xh Ymin" (ou "Xmin" quando < 1h). */
export function formatWorkedMinutes(total: number): string {
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h === 0) return `${m}min`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}min`;
}
