import { z } from "zod";

/** Data de hoje (horário local do servidor) como YYYY-MM-DD. */
export function todayISODate(): string {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

/** Teto de horas na **criação** (distribuição em vários dias). 744h = 31 dias. */
export const MAX_SPLIT_HOURS = 744;

// --- Campos compartilhados -------------------------------------------------
const titleField = z
  .string()
  .trim()
  .min(1, "Informe o título.")
  .max(120, "Título muito longo (máx. 120 caracteres).");

const workDateField = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Informe um dia válido.");

const minutesField = z
  .number()
  .int("Minutos inválidos.")
  .min(0, "Minutos inválidos.")
  .max(59, "Minutos inválidos.");

const descriptionField = z
  .string()
  .trim()
  .min(1, "Informe a descrição.")
  .max(5000, "Descrição muito longa (máx. 5000 caracteres).");

/** Link opcional (ex.: tarefa no ClickUp). Vazio = sem link. */
const optionalLinkField = z
  .string()
  .trim()
  .url("Informe um link válido (https://...).")
  .refine((u) => /^https?:\/\//i.test(u), "O link deve começar com http:// ou https://.")
  .or(z.literal(""))
  .optional();

function hoursField(max: number, message: string) {
  return z
    .number()
    .int("Horas inválidas.")
    .min(0, "Horas inválidas.")
    .max(max, message);
}

const hasTime = (v: { hours: number; minutes: number }) =>
  v.hours * 60 + v.minutes >= 1;
const notFuture = (v: { workDate: string }) => v.workDate <= todayISODate();

/**
 * Validação da **criação** de registro. Permite mais de 24h: o excedente é
 * distribuído em vários dias (máx. 24h/dia) a partir do dia escolhido — ver
 * `createEntry`. O dia **inicial** não pode ser futuro; os dias gerados podem.
 */
export const createEntrySchema = z
  .object({
    title: titleField,
    workDate: workDateField,
    hours: hoursField(MAX_SPLIT_HOURS, `Máximo de ${MAX_SPLIT_HOURS}h.`),
    minutes: minutesField,
    description: descriptionField,
    link: optionalLinkField,
  })
  .refine(hasTime, {
    message: "Informe um tempo trabalhado maior que zero.",
    path: ["minutes"],
  })
  .refine(notFuture, {
    message: "O dia não pode ser no futuro.",
    path: ["workDate"],
  });

/** Validação da **edição** de um registro: um único dia, máximo de 24h. */
export const updateEntrySchema = z
  .object({
    title: titleField,
    workDate: workDateField,
    hours: hoursField(24, "Horas inválidas."),
    minutes: minutesField,
    description: descriptionField,
    link: optionalLinkField,
  })
  .refine(hasTime, {
    message: "Informe um tempo trabalhado maior que zero.",
    path: ["minutes"],
  })
  .refine((v) => v.hours * 60 + v.minutes <= 1440, {
    message: "O tempo trabalhado não pode passar de 24h.",
    path: ["hours"],
  })
  .refine(notFuture, {
    message: "O dia não pode ser no futuro.",
    path: ["workDate"],
  });

export type CreateEntryInput = z.infer<typeof createEntrySchema>;
export type UpdateEntryInput = z.infer<typeof updateEntrySchema>;

/** Formata minutos como "Xh Ymin" (ou "Xmin" quando < 1h). */
export function formatWorkedMinutes(total: number): string {
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h === 0) return `${m}min`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}min`;
}
