import { describe, it, expect } from "vitest";
import { hashPassword, verifyPassword } from "./password";

describe("password", () => {
  it("verifica a senha correta", async () => {
    const stored = await hashPassword("s3nh@-forte");
    expect(await verifyPassword("s3nh@-forte", stored)).toBe(true);
  });

  it("rejeita a senha errada", async () => {
    const stored = await hashPassword("s3nh@-forte");
    expect(await verifyPassword("outra-senha", stored)).toBe(false);
  });

  it("usa salt distinto a cada hash (mesma senha → hashes diferentes)", async () => {
    const a = await hashPassword("igual");
    const b = await hashPassword("igual");
    expect(a).not.toBe(b);
    expect(await verifyPassword("igual", a)).toBe(true);
    expect(await verifyPassword("igual", b)).toBe(true);
  });

  it("rejeita hash em formato inválido sem lançar", async () => {
    expect(await verifyPassword("x", "nao-e-um-hash")).toBe(false);
    expect(await verifyPassword("x", "bcrypt$abc$def")).toBe(false);
  });
});
