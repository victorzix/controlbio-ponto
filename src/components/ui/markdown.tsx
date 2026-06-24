import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Renderer de um subconjunto SEGURO de Markdown, sem `dangerouslySetInnerHTML`.
 *
 * Segurança (ver docs/specs/003-registro-de-ponto/design.md §7):
 * - Monta apenas elementos React conhecidos; todo texto vira *string children*,
 *   que o React escapa automaticamente → `<script>` aparece como texto literal.
 * - Links só viram `<a>` se o esquema for http(s) ou mailto (allowlist); caso
 *   contrário, o trecho é mostrado como texto puro (não clicável).
 *
 * Suporta: negrito, itálico, código inline, links [texto](url), listas (linhas
 * iniciadas por "- "), parágrafos e quebras de linha.
 */

const SAFE_LINK = /^(https?:\/\/|mailto:)/i;

const INLINE_PATTERNS = [
  { type: "code", re: /`([^`]+)`/ },
  { type: "bold", re: /\*\*([^*]+)\*\*/ },
  { type: "italic", re: /\*([^*]+)\*|_([^_]+)_/ },
  { type: "link", re: /\[([^\]]+)\]\(([^)\s]+)\)/ },
] as const;

function parseInline(text: string, keyPrefix: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  let rest = text;
  let n = 0;

  while (rest.length > 0) {
    let best: { type: string; index: number; m: RegExpMatchArray } | null = null;
    for (const p of INLINE_PATTERNS) {
      const m = rest.match(p.re);
      if (m && m.index !== undefined && (best === null || m.index < best.index)) {
        best = { type: p.type, index: m.index, m };
      }
    }

    if (!best) {
      nodes.push(rest);
      break;
    }

    if (best.index > 0) nodes.push(rest.slice(0, best.index));

    const { m, type } = best;
    const key = `${keyPrefix}-${n++}`;

    if (type === "code") {
      nodes.push(
        <code
          key={key}
          className="bg-muted rounded px-1 py-0.5 font-mono text-[0.85em]"
        >
          {m[1]}
        </code>,
      );
    } else if (type === "bold") {
      nodes.push(<strong key={key}>{parseInline(m[1], key)}</strong>);
    } else if (type === "italic") {
      nodes.push(<em key={key}>{parseInline(m[1] ?? m[2] ?? "", key)}</em>);
    } else {
      // link
      const label = m[1];
      const url = m[2];
      if (SAFE_LINK.test(url)) {
        nodes.push(
          <a
            key={key}
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary underline underline-offset-2 hover:no-underline"
          >
            {parseInline(label, key)}
          </a>,
        );
      } else {
        // Esquema não permitido → mostra o markdown como texto puro (não vira link).
        nodes.push(m[0]);
      }
    }

    rest = rest.slice(best.index + m[0].length);
  }

  return nodes;
}

function isListLine(line: string): boolean {
  return /^\s*[-*]\s+/.test(line);
}

function parseBlocks(src: string): React.ReactNode[] {
  const lines = src.replace(/\r\n/g, "\n").split("\n");
  const blocks: React.ReactNode[] = [];
  let i = 0;
  let b = 0;

  while (i < lines.length) {
    if (lines[i].trim() === "") {
      i++;
      continue;
    }

    if (isListLine(lines[i])) {
      const items: string[] = [];
      while (i < lines.length && isListLine(lines[i])) {
        items.push(lines[i].replace(/^\s*[-*]\s+/, ""));
        i++;
      }
      const key = `b-${b++}`;
      blocks.push(
        <ul key={key} className="list-disc space-y-1 pl-5">
          {items.map((it, idx) => (
            <li key={idx}>{parseInline(it, `${key}-${idx}`)}</li>
          ))}
        </ul>,
      );
      continue;
    }

    // Parágrafo: linhas consecutivas não-vazias e não-lista, unidas por <br/>.
    const para: string[] = [];
    while (i < lines.length && lines[i].trim() !== "" && !isListLine(lines[i])) {
      para.push(lines[i]);
      i++;
    }
    const key = `b-${b++}`;
    const inner: React.ReactNode[] = [];
    para.forEach((ln, idx) => {
      if (idx > 0) inner.push(<br key={`br-${idx}`} />);
      inner.push(...parseInline(ln, `${key}-${idx}`));
    });
    blocks.push(<p key={key}>{inner}</p>);
  }

  return blocks;
}

export function Markdown({
  source,
  className,
}: {
  source: string;
  className?: string;
}) {
  return (
    <div className={cn("text-sm leading-relaxed space-y-3 break-words", className)}>
      {parseBlocks(source ?? "")}
    </div>
  );
}
