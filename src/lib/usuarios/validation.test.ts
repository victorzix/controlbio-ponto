import { describe, it, expect } from "vitest";
import { createUserSchema, updateUserSchema } from "./validation";

const base = {
  name: "Fulano de Tal",
  email: "Fulano@Controlbio.com.BR",
  role: "funcionario",
  password: "senha-forte-1",
};

describe("createUserSchema", () => {
  it("aceita dados válidos e normaliza nome/e-mail", () => {
    const r = createUserSchema.safeParse({ ...base, name: "  Fulano  " });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.email).toBe("fulano@controlbio.com.br");
      expect(r.data.name).toBe("Fulano");
    }
  });

  it("rejeita senha curta (< 8)", () => {
    expect(createUserSchema.safeParse({ ...base, password: "123" }).success).toBe(false);
  });

  it("rejeita e-mail inválido", () => {
    expect(createUserSchema.safeParse({ ...base, email: "nao-email" }).success).toBe(false);
  });

  it("rejeita papel inválido", () => {
    expect(createUserSchema.safeParse({ ...base, role: "root" }).success).toBe(false);
  });

  it("exige nome", () => {
    expect(createUserSchema.safeParse({ ...base, name: "" }).success).toBe(false);
  });
});

describe("updateUserSchema", () => {
  it("aceita senha em branco (mantém a atual)", () => {
    expect(updateUserSchema.safeParse({ ...base, password: "" }).success).toBe(true);
  });

  it("aceita senha ausente", () => {
    const { password: _omit, ...semSenha } = base;
    void _omit;
    expect(updateUserSchema.safeParse(semSenha).success).toBe(true);
  });

  it("rejeita senha curta quando preenchida", () => {
    expect(updateUserSchema.safeParse({ ...base, password: "123" }).success).toBe(false);
  });
});
