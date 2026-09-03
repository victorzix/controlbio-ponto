import { z } from "zod";
import { normalizeUsernameInput } from "@/lib/auth/username";

const roleEnum = z.enum(["admin", "funcionario"], {
  error: "Papel inválido.",
});

/**
 * Username (login): normalizado para minúsculas, sem acentos, só a-z0-9.
 * Mínimo de 2 caracteres após a normalização (RN-05 da spec 004).
 */
const usernameField = z
  .string()
  .trim()
  .transform(normalizeUsernameInput)
  .pipe(z.string().min(2, "Informe um usuário válido (mín. 2 caracteres a-z0-9)."));

/**
 * E-mail opcional: aceita vazio ("") ou um e-mail válido (trim + minúsculas).
 * Não é mais usado para login (spec 004, RF-05).
 */
const optionalEmailField = z
  .string()
  .trim()
  .toLowerCase()
  .email("Informe um e-mail válido.")
  .or(z.literal(""))
  .optional();

/**
 * Valor/hora opcional, em **reais** (o form trabalha em reais; a action converte
 * para centavos ao persistir). Vazio → `undefined` (sem valor). Ver spec 002.
 */
const optionalHourlyRate = z
  .number({ error: "Informe um valor válido." })
  .min(0, "O valor não pode ser negativo.")
  .max(100000, "Valor muito alto.")
  .optional();

/**
 * Vínculo com o membro do ClickUp (spec 011, Tarefa 14, RF-12) — **opcional**:
 * um usuário sem vínculo simplesmente não sincroniza (RN-09), não é um erro.
 *
 * Aceita **string OU number** de propósito: o `<select>` do form manda o id do
 * membro como string (ou "" para "sem vínculo"), mas o cliente já entrega esse
 * valor TRANSFORMADO — `zodResolver` roda o parse no client antes de chamar a
 * Server Action, então o servidor recebe `clickupUserId` já como `number`. Só
 * aceitar `string` aqui faz esta MESMA validação (CLAUDE.md §7: "o servidor
 * revalida o mesmo schema") rejeitar toda vez que o client já converteu — que é
 * sempre, no fluxo real deste form.
 */
const optionalClickupUserId = z
  .union([z.string(), z.number()])
  .optional()
  .transform((v, ctx) => {
    if (v === undefined) return undefined;
    if (typeof v === "number") {
      if (!Number.isInteger(v) || v < 0) {
        ctx.addIssue({ code: "custom", message: "Vínculo com o ClickUp inválido." });
        return z.NEVER;
      }
      return v;
    }
    const trimmed = v.trim();
    if (!trimmed) return undefined;
    if (!/^\d+$/.test(trimmed)) {
      ctx.addIssue({ code: "custom", message: "Vínculo com o ClickUp inválido." });
      return z.NEVER;
    }
    return Number(trimmed);
  });

/** Schema de validação para criação de usuário. */
export const createUserSchema = z.object({
  name: z.string().trim().min(2, "Informe o nome."),
  username: usernameField,
  email: optionalEmailField,
  role: roleEnum,
  hourlyRate: optionalHourlyRate,
  clickupUserId: optionalClickupUserId,
  password: z.string().min(8, "A senha deve ter ao menos 8 caracteres."),
});

/** Schema de validação para edição de usuário (senha opcional). */
export const updateUserSchema = z.object({
  name: z.string().trim().min(2, "Informe o nome."),
  username: usernameField,
  email: optionalEmailField,
  role: roleEnum,
  hourlyRate: optionalHourlyRate,
  clickupUserId: optionalClickupUserId,
  password: z
    .string()
    .min(8, "A senha deve ter ao menos 8 caracteres.")
    .optional()
    .or(z.literal("")),
});

export type CreateUserInput = z.infer<typeof createUserSchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;