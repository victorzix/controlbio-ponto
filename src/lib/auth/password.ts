import { randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

/**
 * Hashing de senha com `scrypt` (built-in do Node) — sem dependência nativa.
 * Formato armazenado: `scrypt$<saltHex>$<hashHex>`.
 * Ver `docs/specs/001-autenticacao/design.md` §7.
 */

type ScryptOptions = { N: number; r: number; p: number; maxmem: number };

const scrypt = promisify(scryptCb) as (
  password: string | Buffer,
  salt: string | Buffer,
  keylen: number,
  options: ScryptOptions,
) => Promise<Buffer>;

const KEYLEN = 64;
const SALT_BYTES = 16;
// Parâmetros recomendados (custo de CPU/memória). N=2^16 ⇒ ~64 MiB de memória,
// por isso elevamos o `maxmem` (default do Node é 32 MiB).
const PARAMS: ScryptOptions = { N: 2 ** 16, r: 8, p: 1, maxmem: 192 * 1024 * 1024 };

/** Gera o hash de uma senha em texto puro. */
export async function hashPassword(plain: string): Promise<string> {
  const salt = randomBytes(SALT_BYTES);
  const derived = await scrypt(plain.normalize("NFKC"), salt, KEYLEN, PARAMS);
  return `scrypt$${salt.toString("hex")}$${derived.toString("hex")}`;
}

/** Verifica uma senha contra o hash armazenado, em tempo constante. */
export async function verifyPassword(
  plain: string,
  stored: string,
): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 3 || parts[0] !== "scrypt") return false;

  const salt = Buffer.from(parts[1], "hex");
  const expected = Buffer.from(parts[2], "hex");
  if (salt.length === 0 || expected.length === 0) return false;

  const actual = await scrypt(plain.normalize("NFKC"), salt, expected.length, PARAMS);
  if (actual.length !== expected.length) return false;
  return timingSafeEqual(actual, expected);
}
