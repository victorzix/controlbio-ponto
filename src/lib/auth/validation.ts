import { z } from "zod";

/**
 * Validação e normalização das credenciais de login.
 * E-mail é tratado case-insensitive e sem espaços nas pontas (RN-07).
 */
export const loginSchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .min(1, "Informe o e-mail.")
    .email("Informe um e-mail válido."),
  password: z.string().min(1, "Informe a senha."),
});

export type LoginInput = z.infer<typeof loginSchema>;
