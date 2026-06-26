import { z } from "zod";
import { normalizeUsernameInput } from "@/lib/auth/username";

/**
 * Validação do autoatendimento da própria conta (spec 005-minha-conta).
 *
 * É um subconjunto do `updateUserSchema` de `usuarios`: nome, usuário (login),
 * e-mail e senha — **sem** papel nem valor/hora, que continuam exclusivos do
 * admin. As regras de cada campo são as mesmas usadas na gestão de usuários
 * (a normalização de username vem da spec 004).
 */

/**
 * Username (login): normalizado para minúsculas, sem acentos, só a-z0-9.
 * Mínimo de 2 caracteres após a normalização (RN-06).
 */
const usernameField = z
  .string()
  .trim()
  .transform(normalizeUsernameInput)
  .pipe(z.string().min(2, "Informe um usuário válido (mín. 2 caracteres a-z0-9)."));

/** E-mail opcional: aceita vazio ("") ou um e-mail válido (trim + minúsculas). */
const optionalEmailField = z
  .string()
  .trim()
  .toLowerCase()
  .email("Informe um e-mail válido.")
  .or(z.literal(""))
  .optional();

/** Schema de edição da própria conta. Senha opcional (em branco mantém a atual). */
export const updateOwnAccountSchema = z.object({
  name: z.string().trim().min(2, "Informe o nome."),
  username: usernameField,
  email: optionalEmailField,
  password: z
    .string()
    .min(8, "A senha deve ter ao menos 8 caracteres.")
    .optional()
    .or(z.literal("")),
});

export type UpdateOwnAccountInput = z.infer<typeof updateOwnAccountSchema>;