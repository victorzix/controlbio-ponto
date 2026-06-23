"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { hashPassword, verifyPassword } from "./password";
import {
  createSession,
  invalidateSession,
  SESSION_COOKIE_NAME,
  SESSION_MAX_AGE,
} from "./session";
import { loginSchema } from "./validation";

/** Mensagem genérica — não revela se o e-mail existe (RN-03). */
const GENERIC_ERROR = "E-mail ou senha inválidos.";

export type LoginState = { error?: string };

/**
 * Quando o e-mail não existe, ainda rodamos uma verificação de hash "dummy"
 * para manter o tempo de resposta parecido e evitar enumeração por timing.
 * Calculado uma vez e reaproveitado.
 */
let dummyHashPromise: Promise<string> | null = null;
function getDummyHash(): Promise<string> {
  if (!dummyHashPromise) {
    dummyHashPromise = hashPassword("dummy-anti-enumeration-password");
  }
  return dummyHashPromise;
}

/** Server Action de login. Valida, autentica, cria sessão e redireciona. */
export async function loginAction(
  _prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? GENERIC_ERROR };
  }

  const { email, password } = parsed.data;

  const redirectToRaw = formData.get("redirectTo");
  const redirectTo =
    typeof redirectToRaw === "string" && redirectToRaw.startsWith("/")
      ? redirectToRaw
      : "/";

  const found = await db
    .select()
    .from(users)
    .where(eq(users.email, email))
    .limit(1);
  const user = found[0];

  if (!user) {
    await verifyPassword(password, await getDummyHash());
    return { error: GENERIC_ERROR };
  }

  const ok = await verifyPassword(password, user.passwordHash);
  if (!ok || !user.active) {
    return { error: GENERIC_ERROR };
  }

  const hdrs = await headers();
  const { token } = await createSession(user.id, hdrs.get("user-agent") ?? undefined);

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });

  redirect(redirectTo);
}

/** Server Action de logout. Revoga a sessão no servidor e limpa o cookie. */
export async function logoutAction(): Promise<void> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (token) await invalidateSession(token);
  cookieStore.delete(SESSION_COOKIE_NAME);
  redirect("/login");
}
