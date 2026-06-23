import { eq } from "drizzle-orm";
import { db } from "./index";
import { users } from "./schema";
import { hashPassword } from "../lib/auth/password";

/**
 * Seed do admin inicial — destrava o primeiro acesso ao sistema.
 * Idempotente: se o e-mail já existir, não faz nada.
 *
 * Rodar: `npm run db:seed`
 * Requer SEED_ADMIN_EMAIL e SEED_ADMIN_PASSWORD no .env.
 */
async function main() {
  const email = process.env.SEED_ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.SEED_ADMIN_PASSWORD;
  const name = process.env.SEED_ADMIN_NAME?.trim() || "Administrador";

  if (!email || !password) {
    throw new Error(
      "Defina SEED_ADMIN_EMAIL e SEED_ADMIN_PASSWORD no .env para rodar o seed.",
    );
  }

  const existing = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  if (existing[0]) {
    console.log(`Admin já existe (${email}). Nada a fazer.`);
    return;
  }

  const passwordHash = await hashPassword(password);
  await db.insert(users).values({
    name,
    email,
    passwordHash,
    role: "admin",
    active: true,
  });

  console.log(`Admin criado: ${email}`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
