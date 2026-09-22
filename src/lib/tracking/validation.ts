import { z } from "zod";
import { todayBrasiliaISO } from "@/lib/tz";

/**
 * Validação do **tracking de tempo** (spec 010). O `project` reusa o enum de
 * projeto do ponto (dw|labphase). O tempo em si nunca é informado pelo client
 * durante a contagem — só na **finalização** (horas/minutos por segmento), e é
 * sempre revalidado no servidor.
 */

const titleField = z
  .string()
  .trim()
  .min(1, "Informe o título.")
  .max(120, "Título muito longo (máx. 120 caracteres).");

const projectField = z.enum(["dw", "labphase"]);

const workDateField = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Informe um dia válido.");

const descriptionField = z
  .string()
  .trim()
  .min(1, "Informe a descrição.")
  .max(5000, "Descrição muito longa (máx. 5000 caracteres).");

/** Iniciar: basta título + projeto (RN-02). */
export const startTrackingSchema = z.object({
  title: titleField,
  project: projectField,
});

export type StartTrackingInput = z.infer<typeof startTrackingSchema>;

/** Um segmento no modal de finalização: dia + tempo + descrição (RN-09/10). */
export const finalizeSegmentSchema = z
  .object({
    id: z.string().min(1),
    workDate: workDateField,
    hours: z
      .number()
      .int("Horas inválidas.")
      .min(0, "Horas inválidas.")
      .max(24, "Horas inválidas."),
    minutes: z
      .number()
      .int("Minutos inválidos.")
      .min(0, "Minutos inválidos.")
      .max(59, "Minutos inválidos."),
    description: descriptionField,
  })
  .refine((v) => v.hours * 60 + v.minutes >= 1, {
    message: "Informe um tempo maior que zero.",
    path: ["minutes"],
  })
  .refine((v) => v.hours * 60 + v.minutes <= 1440, {
    message: "O tempo não pode passar de 24h.",
    path: ["hours"],
  });

/**
 * Finalizar: título/projeto (valem para todos) + N segmentos. Cada `workDate`
 * não pode ser no futuro **em Brasília** (RN-10/14). Ao menos um segmento.
 */
export const finalizeTrackingSchema = z
  .object({
    title: titleField,
    project: projectField,
    segments: z.array(finalizeSegmentSchema).min(1, "Nenhum bloco para salvar."),
  })
  .refine((v) => v.segments.every((s) => s.workDate <= todayBrasiliaISO()), {
    message: "O dia não pode ser no futuro.",
    path: ["segments"],
  });

export type FinalizeTrackingInput = z.infer<typeof finalizeTrackingSchema>;
