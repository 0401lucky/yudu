import type { Components } from "react-markdown";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { ReactNode } from "react";

export function isSafeHttpUrl(href: string): boolean {
  try {
    const u = new URL(href);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

const mdComponents: Components = {
  h1: ({ children }) => <h1 className="reader-md-h reader-md-h1">{children}</h1>,
  h2: ({ children }) => <h2 className="reader-md-h reader-md-h2">{children}</h2>,
  h3: ({ children }) => <h3 className="reader-md-h reader-md-h3">{children}</h3>,
  h4: ({ children }) => <h4 className="reader-md-h reader-md-h4">{children}</h4>,
  h5: ({ children }) => <h5 className="reader-md-h reader-md-h5">{children}</h5>,
  h6: ({ children }) => <h6 className="reader-md-h reader-md-h6">{children}</h6>,
  p: ({ children }) => <p className="reader-md-p">{children}</p>,
  ul: ({ children }) => <ul className="reader-md-ul">{children}</ul>,
  ol: ({ children }) => <ol className="reader-md-ol">{children}</ol>,
  li: ({ children, className }) => (
    <li className={className ? `reader-md-li ${className}` : "reader-md-li"}>
      {children}
    </li>
  ),
  strong: ({ children }) => <strong>{children}</strong>,
  em: ({ children }) => <em>{children}</em>,
  del: ({ children }) => <del className="reader-md-del">{children}</del>,
  blockquote: ({ children }) => (
    <blockquote className="reader-md-blockquote">{children}</blockquote>
  ),
  hr: () => <hr className="reader-md-hr" />,
  a: ({ href, children }) => {
    const url = typeof href === "string" ? href : "";
    if (isSafeHttpUrl(url)) {
      return (
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="reader-md-link"
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
        >
          {children}
        </a>
      );
    }
    return <span className="reader-md-link-disabled">{children}</span>;
  },
  code: ({ className, children, ...props }) => {
    // 块级 code 在 pre 内；行内无 language class 或由父级 pre 包裹
    const isBlock = Boolean(className?.includes("language-"));
    if (isBlock) {
      return (
        <code className={`reader-md-code-block ${className ?? ""}`} {...props}>
          {children}
        </code>
      );
    }
    return (
      <code className="reader-md-code" {...props}>
        {children}
      </code>
    );
  },
  pre: ({ children }) => <pre className="reader-md-pre">{children}</pre>,
  table: ({ children }) => (
    <div className="reader-md-table-wrap">
      <table className="reader-md-table">{children}</table>
    </div>
  ),
  thead: ({ children }) => <thead>{children}</thead>,
  tbody: ({ children }) => <tbody>{children}</tbody>,
  tr: ({ children }) => <tr>{children}</tr>,
  th: ({ children }) => <th className="reader-md-th">{children}</th>,
  td: ({ children }) => <td className="reader-md-td">{children}</td>,
  img: ({ alt, src }) => {
    // 远程图：仅展示 alt，避免 XSS / 外链图片与多栏布局问题
    const label = alt?.trim() || "图片";
    if (typeof src === "string" && isSafeHttpUrl(src)) {
      return (
        <span className="reader-md-img-fallback" title={src}>
          [{label}]
        </span>
      );
    }
    return <span className="reader-md-img-fallback">[{label}]</span>;
  },
  // 不渲染原始 HTML（react-markdown 默认忽略 raw HTML）
};

/**
 * 将 Markdown（含 GFM：表格、删除线、任务列表、自动链接等）渲染为 React 节点。
 * 不使用 dangerouslySetInnerHTML；链接仅允许 http(s)。
 */
export function renderMarkdown(src: string): ReactNode {
  const text = src?.trim();
  if (!text) return null;

  return (
    <div className="reader-md">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdComponents}>
        {text}
      </ReactMarkdown>
    </div>
  );
}

/** 近似纯文本长度（进度用，与 API 逻辑粗对齐） */
export function mdPlainLengthApprox(src: string): number {
  return src
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^(\s*)([-*+]|\d+\.)\s+/gm, "$1")
    .replace(/^\|.+\|$/gm, (row) =>
      row
        .split("|")
        .map((c) => c.trim())
        .filter(Boolean)
        .join(" "),
    )
    .replace(/^[-*_]{3,}\s*$/gm, "")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, "$1")
    .replace(/~~([^~]+)~~/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .length;
}
