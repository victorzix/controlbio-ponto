import { asc, eq, ilike, or } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import type { UserRole } from "@/db/schema";

/** Item de lista de usuário — sem passwordHash. */
export type UserListItem = {
  id: string;
  name: string;
  username: string;
  email: string | null;
  role: UserRole;
  hourlyRateCents: number | null;
  active: boolean;
  createdAt: Date;
};

/** Dados de usuário para edição — sem passwordHash. */
export type UserEditData = {
  id: string;
  name: string;
  username: string;
  email: string | null;
  role: UserRole;
  hourlyRateCents: number | null;
  active: boolean;
};

/**
 * Lista todos os usuários ordenados por nome.
 * Se `q` for fornecido, filtra por nome, usuário (login) ou e-mail (ILIKE).
 */
export async function listUsers(q?: string): Promise<UserListItem[]> {
  const columns = {
    id: users.id,
    name: users.name,
    username: users.username,
    email: users.email,
    role: users.role,
    hourlyRateCents: users.hourlyRateCents,
    active: users.active,
    createdAt: users.createdAt,
  };

  if (q && q.trim() !== "") {
    const term = `%${q.trim()}%`;
    return db
      .select(columns)
      .from(users)
      .where(
        or(
          ilike(users.name, term),
          ilike(users.username, term),
          ilike(users.email, term),
        ),
      )
      .orderBy(asc(users.name));
  }

  return db.select(columns).from(users).orderBy(asc(users.name));
}

/**
 * Busca um único usuário pelo id.
 * Retorna null se não encontrado. Nunca inclui passwordHash.
 */
export async function getUserById(id: string): Promise<UserEditData | null> {
  const rows = await db
    .select({
      id: users.id,
      name: users.name,
      username: users.username,
      email: users.email,
      role: users.role,
      hourlyRateCents: users.hourlyRateCents,
      active: users.active,
    })
    .from(users)
    .where(eq(users.id, id))
    .limit(1);

  return rows[0] ?? null;
}