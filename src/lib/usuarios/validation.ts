import { z } from "zod";

const roleEnum = z.enum(["admin", "funcionario"], {
  error: "Papel inválido.",
});

/** Schema de validação para criação de usuário. */
export const createUserSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Informe o nome."),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .min(1, "Informe o e-mail.")
    .email("Informe um e-mail válido."),
  role: roleEnum,
  password: z
    .string()
    .min(8, "A senha deve ter ao menos 8 caracteres."),
});

/** Schema de validação para edição de usuário (senha opcional). */
export const updateUserSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Informe o nome."),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .min(1, "Informe o e-mail.")
    .email("Informe um e-mail válido."),
  role: roleEnum,
  password: z
    .string()
    .min(8, "A senha deve ter ao menos 8 caracteres.")
    .optional()
    .or(z.literal("")),
});

export type CreateUserInput = z.infer<typeof createUserSchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
