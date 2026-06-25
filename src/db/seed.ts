import { eq } from "drizzle-orm";
import { db } from "./index";
import { users } from "./schema";
import { hashPassword } from "../lib/auth/password";
import { deriveUsernameFromName, normalizeUsernameInput } from "../lib/auth/username";

/**
 * Seed do admin inicial — destrava o primeiro acesso ao sistema.
 * Idempotente: se o username já existir, não faz nada.
 *
 * Rodar: `npm run db:seed`
 * Requer SEED_ADMIN_PASSWORD no .env. Opcionais: SEED_ADMIN_NAME,
 * SEED_ADMIN_USERNAME (default = 1º nome normalizado), SEED_ADMIN_EMAIL.
 */
async function main() {
  const password = process.env.SEED_ADMIN_PASSWORD;
  const name = process.env.SEED_ADMIN_NAME?.trim() || "Administrador";
  const email = process.env.SEED_ADMIN_EMAIL?.trim().toLowerCase() || null;
  const username = process.env.SEED_ADMIN_USERNAME
    ? normalizeUsernameInput(process.env.SEED_ADMIN_USERNAME)
    : deriveUsernameFromName(name);

  if (!password) {
    throw new Error("Defina SEED_ADMIN_PASSWORD no .env para rodar o seed.");
  }
  if (!username) {
    throw new Error(
      "Não foi possível derivar o usuário do admin. Defina SEED_ADMIN_USERNAME no .env.",
    );
  }

  const existing = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.username, username))
    .limit(1);

  if (existing[0]) {
    console.log(`Admin já existe (${username}). Nada a fazer.`);
    return;
  }

  const passwordHash = await hashPassword(password);
  await db.insert(users).values({
    name,
    username,
    email,
    passwordHash,
    role: "admin",
    active: true,
  });

  console.log(`Admin criado: ${username}`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
