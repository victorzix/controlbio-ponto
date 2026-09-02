import { describe, it, expect } from "vitest";
import { suggestMemberFor, type ClickUpMember } from "./members";

const membros: ClickUpMember[] = [
  { id: 1, username: "Fulano de Tal", email: "fulano@controlbio.com.br" },
  { id: 2, username: "Ciclana Souza", email: "ciclana@controlbio.com.br" },
  { id: 3, username: "Beltrano sem e-mail" },
];

describe("suggestMemberFor", () => {
  it("casa por e-mail exato, mesmo com nomes diferentes", () => {
    const usuario = { name: "Nome Bem Diferente", email: "fulano@controlbio.com.br" };
    expect(suggestMemberFor(usuario, membros)?.id).toBe(1);
  });

  it("casa por nome normalizado quando os e-mails são diferentes", () => {
    const usuario = { name: "Ciclana Souza", email: "outro@empresa.com" };
    expect(suggestMemberFor(usuario, membros)?.id).toBe(2);
  });

  it("não casa quando os dois lados não têm e-mail (cai para o nome)", () => {
    // Nem o usuário nem o membro "Beltrano sem e-mail" têm e-mail: comparar
    // ausente com ausente NUNCA pode virar "match" por e-mail — só por nome.
    const usuario = { name: "Nome Qualquer", email: undefined };
    expect(suggestMemberFor(usuario, membros)).toBeNull();
  });

  it("casa por nome quando os dois lados não têm e-mail e o nome bate", () => {
    const usuario = { name: "Beltrano sem e-mail", email: undefined };
    expect(suggestMemberFor(usuario, membros)?.id).toBe(3);
  });

  it("não casa por e-mail quando só o usuário da aplicação não tem e-mail", () => {
    const usuario = { name: "Nome Diferente", email: undefined };
    // O membro 1 tem e-mail, o usuário não — não pode comparar undefined com
    // um valor presente e ainda assim declarar "match".
    expect(suggestMemberFor(usuario, membros)).toBeNull();
  });

  it("não casa por e-mail quando só o membro do ClickUp não tem e-mail", () => {
    const usuario = { name: "Nome Diferente", email: "algo@empresa.com" };
    // O membro 3 não tem e-mail — o e-mail do usuário não pode "casar" com
    // um e-mail ausente do outro lado.
    expect(suggestMemberFor(usuario, membros)).toBeNull();
  });

  it("tolera acento e caixa na comparação por nome", () => {
    const usuario = { name: "CICLANA SOUZA", email: undefined };
    expect(suggestMemberFor(usuario, membros)?.id).toBe(2);

    const usuario2 = { name: "josé da silva", email: undefined };
    const comAcento: ClickUpMember[] = [{ id: 9, username: "Jose da Silva" }];
    expect(suggestMemberFor(usuario2, comAcento)?.id).toBe(9);
  });

  it("não sugere nada quando nada casa", () => {
    const usuario = { name: "Ninguém Parecido", email: "ninguem@nada.com" };
    expect(suggestMemberFor(usuario, membros)).toBeNull();
  });

  it("trata e-mail em branco (só espaços) como ausente", () => {
    const usuario = { name: "Nome Diferente", email: "   " };
    expect(suggestMemberFor(usuario, membros)).toBeNull();
  });
});
