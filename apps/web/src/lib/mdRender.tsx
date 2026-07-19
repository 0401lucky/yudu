import type { ReactNode } from "react";

/** 块级节点 */
export type MdBlock =
  | { type: "p"; text: string }
  | { type: "h"; level: number; text: string }
  | { type: "ul"; items: string[] }
  | { type: "ol"; items: string[] };

/**
 * 将 Markdown 子集源文切成块（段落 / 标题 / 列表）。
 * 不处理表格、代码围栏、HTML。
 */
export function parseMdBlocks(src: string): MdBlock[] {
  const text = src.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
  if (!text) return [];

  const lines = text.split("\n");
  const blocks: MdBlock[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i]!;
    const trimmed = line.trim();

    if (!trimmed) {
      i += 1;
      continue;
    }

    const heading = trimmed.match(/^(#{1,6})\s+(.+)$/);
    if (heading) {
      blocks.push({
        type: "h",
        level: heading[1]!.length,
        text: heading[2]!.trim(),
      });
      i += 1;
      continue;
    }

    const ul = trimmed.match(/^[-*+]\s+(.+)$/);
    if (ul) {
      const items: string[] = [];
      while (i < lines.length) {
        const t = lines[i]!.trim();
        const m = t.match(/^[-*+]\s+(.+)$/);
        if (!m) break;
        items.push(m[1]!);
        i += 1;
      }
      blocks.push({ type: "ul", items });
      continue;
    }

    const ol = trimmed.match(/^\d+\.\s+(.+)$/);
    if (ol) {
      const items: string[] = [];
      while (i < lines.length) {
        const t = lines[i]!.trim();
        const m = t.match(/^\d+\.\s+(.+)$/);
        if (!m) break;
        items.push(m[1]!);
        i += 1;
      }
      blocks.push({ type: "ol", items });
      continue;
    }

    // 段落：连续非空、非标题、非列表行
    const para: string[] = [];
    while (i < lines.length) {
      const t = lines[i]!.trim();
      if (!t) break;
      if (/^#{1,6}\s+/.test(t)) break;
      if (/^[-*+]\s+/.test(t)) break;
      if (/^\d+\.\s+/.test(t)) break;
      para.push(t);
      i += 1;
    }
    if (para.length) {
      blocks.push({ type: "p", text: para.join("\n") });
    }
  }

  return blocks;
}

type InlineToken =
  | { type: "text"; value: string }
  | { type: "strong"; value: string }
  | { type: "em"; value: string }
  | { type: "code"; value: string }
  | { type: "link"; text: string; href: string };

/** 行内：粗体、斜体、行内代码、链接（可重叠时优先 ** ` [ */
export function parseInline(src: string): InlineToken[] {
  const tokens: InlineToken[] = [];
  let i = 0;
  let buf = "";

  const flush = () => {
    if (buf) {
      tokens.push({ type: "text", value: buf });
      buf = "";
    }
  };

  while (i < src.length) {
    // 行内代码
    if (src[i] === "`") {
      const end = src.indexOf("`", i + 1);
      if (end > i + 1) {
        flush();
        tokens.push({ type: "code", value: src.slice(i + 1, end) });
        i = end + 1;
        continue;
      }
    }

    // 粗体 **...**
    if (src.startsWith("**", i)) {
      const end = src.indexOf("**", i + 2);
      if (end > i + 2) {
        flush();
        tokens.push({ type: "strong", value: src.slice(i + 2, end) });
        i = end + 2;
        continue;
      }
    }

    // 链接 [text](url)
    if (src[i] === "[") {
      const closeBracket = src.indexOf("]", i + 1);
      if (
        closeBracket > i + 1 &&
        src[closeBracket + 1] === "(" &&
        src.indexOf(")", closeBracket + 2) > closeBracket + 2
      ) {
        const closeParen = src.indexOf(")", closeBracket + 2);
        const linkText = src.slice(i + 1, closeBracket);
        const href = src.slice(closeBracket + 2, closeParen);
        flush();
        tokens.push({ type: "link", text: linkText, href });
        i = closeParen + 1;
        continue;
      }
    }

    // 斜体 *...*（非 **）
    if (src[i] === "*" && src[i + 1] !== "*") {
      const end = src.indexOf("*", i + 1);
      if (end > i + 1 && src[end + 1] !== "*") {
        flush();
        tokens.push({ type: "em", value: src.slice(i + 1, end) });
        i = end + 1;
        continue;
      }
    }

    buf += src[i];
    i += 1;
  }
  flush();
  return tokens;
}

export function isSafeHttpUrl(href: string): boolean {
  try {
    const u = new URL(href);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

function renderInline(tokens: InlineToken[], keyPrefix: string): ReactNode[] {
  return tokens.map((t, idx) => {
    const key = `${keyPrefix}-${idx}`;
    switch (t.type) {
      case "text":
        return <span key={key}>{t.value}</span>;
      case "strong":
        return <strong key={key}>{t.value}</strong>;
      case "em":
        return <em key={key}>{t.value}</em>;
      case "code":
        return (
          <code key={key} className="reader-md-code">
            {t.value}
          </code>
        );
      case "link":
        if (isSafeHttpUrl(t.href)) {
          return (
            <a
              key={key}
              href={t.href}
              target="_blank"
              rel="noopener noreferrer"
              className="reader-md-link"
              onClick={(e) => e.stopPropagation()}
              onPointerDown={(e) => e.stopPropagation()}
            >
              {t.text}
            </a>
          );
        }
        return <span key={key}>{t.text}</span>;
      default:
        return null;
    }
  });
}

/** 将 MD 源文渲染为可读 React 节点树 */
export function renderMarkdown(src: string): ReactNode {
  const blocks = parseMdBlocks(src);
  if (!blocks.length) return null;

  return (
    <div className="reader-md">
      {blocks.map((b, i) => {
        const key = `b-${i}`;
        if (b.type === "p") {
          return (
            <p key={key} className="reader-md-p">
              {renderInline(parseInline(b.text), key)}
            </p>
          );
        }
        if (b.type === "h") {
          const level = Math.min(6, Math.max(1, b.level));
          const className = `reader-md-h reader-md-h${level}`;
          const children = renderInline(parseInline(b.text), key);
          switch (level) {
            case 1:
              return (
                <h1 key={key} className={className}>
                  {children}
                </h1>
              );
            case 2:
              return (
                <h2 key={key} className={className}>
                  {children}
                </h2>
              );
            case 3:
              return (
                <h3 key={key} className={className}>
                  {children}
                </h3>
              );
            case 4:
              return (
                <h4 key={key} className={className}>
                  {children}
                </h4>
              );
            case 5:
              return (
                <h5 key={key} className={className}>
                  {children}
                </h5>
              );
            default:
              return (
                <h6 key={key} className={className}>
                  {children}
                </h6>
              );
          }
        }
        if (b.type === "ul") {
          return (
            <ul key={key} className="reader-md-ul">
              {b.items.map((item, j) => (
                <li key={`${key}-i${j}`}>
                  {renderInline(parseInline(item), `${key}-i${j}`)}
                </li>
              ))}
            </ul>
          );
        }
        return (
          <ol key={key} className="reader-md-ol">
            {b.items.map((item, j) => (
              <li key={`${key}-i${j}`}>
                {renderInline(parseInline(item), `${key}-i${j}`)}
              </li>
            ))}
          </ol>
        );
      })}
    </div>
  );
}

/** 近似纯文本长度（进度用，与 API 逻辑粗对齐） */
export function mdPlainLengthApprox(src: string): number {
  return src
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^(\s*)([-*+]|\d+\.)\s+/gm, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .length;
}
