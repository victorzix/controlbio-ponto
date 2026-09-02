import { describe, it, expect } from "vitest";
import { encryptToken, decryptToken, generateKeyBase64 } from "./crypto";

const KEY = generateKeyBase64();
const OTHER_KEY = generateKeyBase64();

describe("encryptToken / decryptToken", () => {
  it("faz a ida e volta", () => {
    const token = "pk_12345678_ABCDEFGHIJKLMNOP";
    expect(decryptToken(encryptToken(token, KEY), KEY)).toBe(token);
  });

  it("nunca devolve o texto em claro no payload", () => {
    const token = "pk_segredo_do_usuario";
    expect(encryptToken(token, KEY)).not.toContain("pk_segredo");
  });

  it("gera payload diferente a cada cifra (IV aleatório)", () => {
    const token = "pk_igual";
    expect(encryptToken(token, KEY)).not.toBe(encryptToken(token, KEY));
  });

  it("recusa decifrar com a chave errada", () => {
    const payload = encryptToken("pk_abc", KEY);
    expect(() => decryptToken(payload, OTHER_KEY)).toThrow();
  });

  it("recusa payload adulterado (GCM autentica)", () => {
    const payload = encryptToken("pk_abc", KEY);
    const parts = payload.split(".");
    parts[2] = Buffer.from("outra-coisa").toString("base64");
    expect(() => decryptToken(parts.join("."), KEY)).toThrow();
  });

  it("recusa payload com formato inválido", () => {
    expect(() => decryptToken("nao-e-um-payload", KEY)).toThrow();
  });

  it("recusa chave com tamanho errado", () => {
    const curta = Buffer.alloc(16).toString("base64");
    expect(() => encryptToken("pk_abc", curta)).toThrow();
  });
});
