import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
} from "node:crypto";

/**
 * Cifra do token pessoal do ClickUp — spec 011, RNF de segurança.
 *
 * É segredo de terceiro: só pode existir em claro em memória, no instante da
 * chamada. AES-256-GCM porque além de cifrar ele AUTENTICA — payload adulterado
 * falha ao decifrar em vez de devolver lixo.
 *
 * Formato: base64(iv).base64(authTag).base64(ciphertext)
 * A chave vive em CLICKUP_TOKEN_ENC_KEY (fora do banco) — vazamento do dump não
 * expõe token nenhum.
 */

const IV_BYTES = 12; // recomendado para GCM
const KEY_BYTES = 32; // AES-256

function loadKey(keyBase64: string): Buffer {
  const key = Buffer.from(keyBase64, "base64");
  if (key.length !== KEY_BYTES) {
    throw new Error(
      `CLICKUP_TOKEN_ENC_KEY inválida: esperados ${KEY_BYTES} bytes em base64, veio ${key.length}.`,
    );
  }
  return key;
}

/** Gera uma chave nova — use para preencher CLICKUP_TOKEN_ENC_KEY no .env. */
export function generateKeyBase64(): string {
  return randomBytes(KEY_BYTES).toString("base64");
}

export function encryptToken(plain: string, keyBase64: string): string {
  const key = loadKey(keyBase64);
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(plain, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return [
    iv.toString("base64"),
    tag.toString("base64"),
    ciphertext.toString("base64"),
  ].join(".");
}

export function decryptToken(payload: string, keyBase64: string): string {
  const key = loadKey(keyBase64);
  const parts = payload.split(".");
  if (parts.length !== 3) {
    throw new Error("Token cifrado com formato inválido.");
  }
  const [ivB64, tagB64, dataB64] = parts;
  const decipher = createDecipheriv(
    "aes-256-gcm",
    key,
    Buffer.from(ivB64, "base64"),
  );
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(dataB64, "base64")),
    decipher.final(),
  ]).toString("utf8");
}
