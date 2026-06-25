import { z } from "zod";
import { normalizeUsernameInput } from "./username";

/**
 * Validação e normalização das credenciais de login.
 * O login é por **usuário** (primeiro nome), normalizado para minúsculas e sem
 * acentos — qualquer combinação de maiúsculas/acentos resolve para o mesmo
 * usuário (spec 004-login-por-nome, RN-02).
 */
export const loginSchema = z.object({
  username: z
    .string()
    .trim()
    .transform(normalizeUsernameInput)
    .pipe(z.string().min(1, "Informe o usuário.")),
  password: z.string().min(1, "Informe a senha."),
});

export type LoginInput = z.infer<typeof loginSchema>;
