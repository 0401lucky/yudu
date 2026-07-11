/**
 * 生成书名抽象封面 SVG：深色背景 + 琥珀装饰线 + 书名。
 * 存 R2 时 Content-Type: image/svg+xml
 */
export function generateCoverSvg(
  title: string,
  author: string | null,
): string {
  const displayTitle = truncate(title.trim() || "未命名", 24);
  const displayAuthor = author ? truncate(author.trim(), 20) : null;

  const titleLines = wrapText(displayTitle, 10);
  const titleTspans = titleLines
    .map((line, i) => {
      const dy = i === 0 ? 0 : 36;
      return `<tspan x="150" dy="${dy}">${escapeXml(line)}</tspan>`;
    })
    .join("");

  const authorBlock = displayAuthor
    ? `<text x="150" y="420" text-anchor="middle" fill="#c4b5a0" font-family="Georgia, 'Noto Serif SC', serif" font-size="14">${escapeXml(displayAuthor)}</text>`
    : "";

  // 标题垂直居中附近：按行数微调起点
  const titleStartY = 250 - ((titleLines.length - 1) * 36) / 2;

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="300" height="450" viewBox="0 0 300 450">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#0f1419"/>
      <stop offset="55%" stop-color="#1a2332"/>
      <stop offset="100%" stop-color="#0c1017"/>
    </linearGradient>
    <linearGradient id="amber" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#d4a574" stop-opacity="0.2"/>
      <stop offset="50%" stop-color="#e8b86d" stop-opacity="1"/>
      <stop offset="100%" stop-color="#d4a574" stop-opacity="0.2"/>
    </linearGradient>
  </defs>
  <rect width="300" height="450" fill="url(#bg)"/>
  <!-- 细雨纹理（点阵） -->
  <g opacity="0.12" fill="#8ba3c7">
    <circle cx="40" cy="60" r="1.2"/><circle cx="90" cy="120" r="1"/><circle cx="160" cy="45" r="1.1"/>
    <circle cx="220" cy="95" r="1"/><circle cx="270" cy="55" r="1.2"/><circle cx="55" cy="200" r="1"/>
    <circle cx="130" cy="170" r="1.1"/><circle cx="250" cy="210" r="1"/><circle cx="30" cy="320" r="1.1"/>
    <circle cx="100" cy="360" r="1"/><circle cx="200" cy="340" r="1.2"/><circle cx="280" cy="380" r="1"/>
  </g>
  <!-- 琥珀装饰线 -->
  <rect x="60" y="80" width="180" height="1.5" fill="url(#amber)"/>
  <rect x="90" y="88" width="120" height="1" fill="url(#amber)" opacity="0.6"/>
  <text x="150" y="${titleStartY}" text-anchor="middle" fill="#f0e6d8" font-family="Georgia, 'Noto Serif SC', 'Songti SC', serif" font-size="28" font-weight="600">${titleTspans}</text>
  <rect x="90" y="360" width="120" height="1" fill="url(#amber)" opacity="0.6"/>
  <rect x="60" y="368" width="180" height="1.5" fill="url(#amber)"/>
  ${authorBlock}
</svg>`;
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 1) + "…";
}

/** 按大致字符数折行（中英混排粗略） */
function wrapText(s: string, maxChars: number): string[] {
  if (s.length <= maxChars) return [s];
  const lines: string[] = [];
  let rest = s;
  while (rest.length > maxChars) {
    lines.push(rest.slice(0, maxChars));
    rest = rest.slice(maxChars);
  }
  if (rest) lines.push(rest);
  return lines.slice(0, 4); // 最多 4 行
}
