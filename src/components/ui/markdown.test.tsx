import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { Markdown } from "./markdown";

function render(src: string): string {
  return renderToStaticMarkup(<Markdown source={src} />);
}

describe("Markdown — formatação", () => {
  it("renderiza negrito", () => {
    expect(render("isso é **forte**")).toContain("<strong>forte</strong>");
  });

  it("renderiza itálico", () => {
    expect(render("um *destaque* aqui")).toContain("<em>destaque</em>");
  });

  it("renderiza link http seguro (nova aba + rel)", () => {
    const html = render("veja [aqui](https://controlbio.com.br)");
    expect(html).toContain('href="https://controlbio.com.br"');
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer"');
  });

  it("renderiza lista", () => {
    const html = render("- um\n- dois");
    expect(html).toContain("<ul");
    expect(html.match(/<li>/g)?.length).toBe(2);
  });
});

describe("Markdown — segurança (XSS)", () => {
  it("escapa HTML cru, não injeta <script>", () => {
    const html = render("<script>alert(1)</script>");
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("não cria link com esquema javascript:", () => {
    const html = render("[x](javascript:alert(1))");
    expect(html).not.toContain('href="javascript:');
    expect(html).not.toContain("<a ");
  });

  it("não cria link com esquema data:", () => {
    const html = render("[x](data:text/html,abc)");
    expect(html).not.toContain("<a ");
  });
});
