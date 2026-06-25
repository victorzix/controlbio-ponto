import { describe, it, expect } from "vitest";
import { createUserSchema, updateUserSchema } from "./validation";

const base = {
  name: "Fulano de Tal",
  username: "Fulano",
  email: "Fulano@Controlbio.com.BR",
  role: "funcionario",
  password: "senha-forte-1",
};

describe("createUserSchema", () => {
  it("aceita dados válidos e normaliza nome/username/e-mail", () => {
    const r = createUserSchema.safeParse({ ...base, name: "  Fulano  " });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.username).toBe("fulano");
      expect(r.data.email).toBe("fulano@controlbio.com.br");
      expect(r.data.name).toBe("Fulano");
    }
  });

  it("normaliza o username (sem acento, minúsculas, só a-z0-9)", () => {
    const r = createUserSchema.safeParse({ ...base, username: "Andréy!" });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.username).toBe("andrey");
  });

  it("aceita e-mail vazio (opcional)", () => {
    expect(createUserSchema.safeParse({ ...base, email: "" }).success).toBe(true);
  });

  it("aceita e-mail ausente (opcional)", () => {
    const { email: _omit, ...semEmail } = base;
    void _omit;
    expect(createUserSchema.safeParse(semEmail).success).toBe(true);
  });

  it("aceita valor/hora ausente e válido", () => {
    expect(createUserSchema.safeParse(base).success).toBe(true);
    const r = createUserSchema.safeParse({ ...base, hourlyRate: 50.5 });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.hourlyRate).toBe(50.5);
  });

  it("rejeita valor/hora negativo", () => {
    expect(
      createUserSchema.safeParse({ ...base, hourlyRate: -1 }).success,
    ).toBe(false);
  });

  it("rejeita senha curta (< 8)", () => {
    expect(createUserSchema.safeParse({ ...base, password: "123" }).success).toBe(false);
  });

  it("rejeita e-mail inválido quando informado", () => {
    expect(createUserSchema.safeParse({ ...base, email: "nao-email" }).success).toBe(false);
  });

  it("rejeita username vazio após normalizar", () => {
    expect(createUserSchema.safeParse({ ...base, username: "!!!" }).success).toBe(false);
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