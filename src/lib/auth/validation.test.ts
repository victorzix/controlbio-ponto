import { describe, it, expect } from "vitest";
import { loginSchema } from "./validation";

describe("loginSchema", () => {
  it("normaliza o usuário (trim + minúsculas + sem acento)", () => {
    const result = loginSchema.safeParse({
      username: "  Andréy  ",
      password: "x",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.username).toBe("andrey");
    }
  });

  it("resolve maiúsculas para o mesmo usuário", () => {
    const a = loginSchema.safeParse({ username: "ANDREY", password: "x" });
    const b = loginSchema.safeParse({ username: "Andrey", password: "x" });
    expect(a.success && b.success).toBe(true);
    if (a.success && b.success) {
      expect(a.data.username).toBe("andrey");
      expect(b.data.username).toBe("andrey");
    }
  });

  it("rejeita usuário vazio após normalizar", () => {
    expect(
      loginSchema.safeParse({ username: "  ---  ", password: "x" }).success,
    ).toBe(false);
  });

  it("exige a senha", () => {
    expect(
      loginSchema.safeParse({ username: "andrey", password: "" }).success,
    ).toBe(false);
  });
});