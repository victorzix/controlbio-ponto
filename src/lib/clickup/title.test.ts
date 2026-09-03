import { describe, it, expect } from "vitest";
import { normalizeTitle } from "./title";

describe("normalizeTitle", () => {
  it("baixa a caixa", () => {
    expect(normalizeTitle("Criar Acessos")).toBe("criar acessos");
  });

  it("remove acentos", () => {
    expect(normalizeTitle("Migração de Usuários")).toBe("migracao de usuarios");
  });

  it("colapsa espaços repetidos e apara as pontas", () => {
    expect(normalizeTitle("  Criar   Acessos  ")).toBe("criar acessos");
  });

  it("trata o mesmo título escrito de formas diferentes como igual", () => {
    expect(normalizeTitle("CRIAR ACESSOS")).toBe(normalizeTitle("criar  acessos"));
  });

  it("preserva números e hífen", () => {
    expect(normalizeTitle("Sprint 17 - RDM 4021")).toBe("sprint 17 - rdm 4021");
  });

  it("não estoura com string vazia", () => {
    expect(normalizeTitle("")).toBe("");
  });
});
