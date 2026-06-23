import { describe, it, expect } from "vitest";
import { loginSchema } from "./validation";

describe("loginSchema", () => {
  it("normaliza o e-mail (trim + lowercase)", () => {
    const result = loginSchema.safeParse({
      email: "  ADM@Controlbio.com.BR  ",
      password: "x",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.email).toBe("adm@controlbio.com.br");
    }
  });

  it("rejeita e-mail inválido", () => {
    expect(
      loginSchema.safeParse({ email: "nao-email", password: "x" }).success,
    ).toBe(false);
  });

  it("exige a senha", () => {
    expect(
      loginSchema.safeParse({ email: "a@b.com", password: "" }).success,
    ).toBe(false);
  });
});
