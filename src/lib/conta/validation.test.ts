import { describe, it, expect } from "vitest";
import { connectClickUpSchema } from "./validation";

/**
 * Schema puro do token pessoal do ClickUp (spec 011, Tarefa 15). Cobre só a
 * FORMA (`pk_...`) — a prova de que o token realmente autentica é feita pela
 * Server Action (`connectClickUp`), fora do escopo deste schema.
 */
describe("connectClickUpSchema", () => {
  it("aceita um token bem formado", () => {
    const result = connectClickUpSchema.safeParse({
      token: "pk_12345678_ABCDEFGHIJKLMNOP",
    });
    expect(result.success).toBe(true);
  });

  it("recusa token vazio", () => {
    const result = connectClickUpSchema.safeParse({ token: "" });
    expect(result.success).toBe(false);
  });

  it("recusa token sem o prefixo pk_", () => {
    const result = connectClickUpSchema.safeParse({
      token: "12345678_ABCDEFGHIJKLMNOP",
    });
    expect(result.success).toBe(false);
  });

  it("remove espaços em volta antes de validar (paste com espaço)", () => {
    const result = connectClickUpSchema.safeParse({
      token: "  pk_12345678_ABCDEFGHIJKLMNOP  ",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.token).toBe("pk_12345678_ABCDEFGHIJKLMNOP");
    }
  });
});
