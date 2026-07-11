import { unzipSync } from "fflate";
import type { ParseCover, ParseResult, ParsedChapter } from "./types";

type ZipFiles = Record<string, Uint8Array>;

export async function parseEpub(
  bytes: Uint8Array,
  filename: string,
): Promise<ParseResult> {
  const files = unzipEpub(bytes);
  const opfPath = findOpfPath(files);
  const opfDir = dirnamePath(opfPath);
  const opfXml = decodeUtf8(readFile(files, opfPath));

  const title =
    firstXmlText(opfXml, /<dc:title[^>]*>([\s\S]*?)<\/dc:title>/i) ??
    titleFromFilename(filename);
  const author =
    firstXmlText(opfXml, /<dc:creator[^>]*>([\s\S]*?)<\/dc:creator>/i) ?? null;

  const manifest = parseManifest(opfXml);
  const spineIds = parseSpine(opfXml);
  const chapters = extractChapters(files, opfDir, manifest, spineIds, title);
  const cover = extractCover(files, opfDir, opfXml, manifest);

  return {
    title: decodeXmlEntities(title).trim() || titleFromFilename(filename),
    author: author ? decodeXmlEntities(author).trim() || null : null,
    chapters,
    ...(cover ? { cover } : {}),
  };
}

function unzipEpub(bytes: Uint8Array): ZipFiles {
  try {
    const raw = unzipSync(bytes);
    const files: ZipFiles = {};
    for (const [k, v] of Object.entries(raw)) {
      files[normalizeZipPath(k)] = v;
    }
    return files;
  } catch {
    throw new Error("无法解析 EPUB（ZIP 损坏或格式无效）");
  }
}

function findOpfPath(files: ZipFiles): string {
  const containerPath = Object.keys(files).find(
    (p) => p.toLowerCase() === "meta-inf/container.xml",
  );
  if (!containerPath) {
    throw new Error("EPUB 缺少 META-INF/container.xml");
  }
  const xml = decodeUtf8(files[containerPath]);
  const m = xml.match(/full-path\s*=\s*["']([^"']+)["']/i);
  if (!m) {
    throw new Error("container.xml 中未找到 rootfile full-path");
  }
  const opfPath = normalizeZipPath(m[1]);
  if (!files[opfPath]) {
    // 大小写不敏感回退
    const found = Object.keys(files).find(
      (p) => p.toLowerCase() === opfPath.toLowerCase(),
    );
    if (!found) throw new Error(`EPUB 缺少 OPF：${opfPath}`);
    return found;
  }
  return opfPath;
}

interface ManifestItem {
  id: string;
  href: string;
  mediaType: string;
  properties: string;
}

function parseManifest(opfXml: string): Map<string, ManifestItem> {
  const map = new Map<string, ManifestItem>();
  const manifestBlock = opfXml.match(/<manifest\b[^>]*>([\s\S]*?)<\/manifest>/i);
  if (!manifestBlock) return map;
  const itemRe =
    /<item\b([^>]*?)\s*\/?>/gi;
  let m: RegExpExecArray | null;
  while ((m = itemRe.exec(manifestBlock[1])) !== null) {
    const attrs = m[1];
    const id = attr(attrs, "id");
    const href = attr(attrs, "href");
    if (!id || !href) continue;
    map.set(id, {
      id,
      href: decodeXmlEntities(href),
      mediaType: attr(attrs, "media-type") ?? "",
      properties: attr(attrs, "properties") ?? "",
    });
  }
  return map;
}

function parseSpine(opfXml: string): string[] {
  const spineBlock = opfXml.match(/<spine\b[^>]*>([\s\S]*?)<\/spine>/i);
  if (!spineBlock) return [];
  const ids: string[] = [];
  const refRe = /<itemref\b([^>]*?)\s*\/?>/gi;
  let m: RegExpExecArray | null;
  while ((m = refRe.exec(spineBlock[1])) !== null) {
    const idref = attr(m[1], "idref");
    if (idref) ids.push(idref);
  }
  return ids;
}

function extractChapters(
  files: ZipFiles,
  opfDir: string,
  manifest: Map<string, ManifestItem>,
  spineIds: string[],
  fallbackTitle: string,
): ParsedChapter[] {
  const chapters: ParsedChapter[] = [];

  for (const id of spineIds) {
    const item = manifest.get(id);
    if (!item) continue;
    if (!isDocumentMedia(item.mediaType, item.href)) continue;

    const path = resolveZipPath(opfDir, item.href);
    const entry = readFileOptional(files, path);
    if (!entry) continue;

    const xhtml = decodeUtf8(entry);
    const text = htmlToText(xhtml);
    if (!text) continue;

    const title =
      chapterTitleFromHtml(xhtml) ||
      item.id ||
      `第 ${chapters.length + 1} 章`;

    chapters.push({ title, text });
  }

  if (chapters.length === 0) {
    // 兜底：manifest 中任意 xhtml
    for (const item of manifest.values()) {
      if (!isDocumentMedia(item.mediaType, item.href)) continue;
      const path = resolveZipPath(opfDir, item.href);
      const entry = readFileOptional(files, path);
      if (!entry) continue;
      const xhtml = decodeUtf8(entry);
      const text = htmlToText(xhtml);
      if (!text) continue;
      chapters.push({
        title: chapterTitleFromHtml(xhtml) || fallbackTitle,
        text,
      });
    }
  }

  if (chapters.length === 0) {
    throw new Error("EPUB 未找到可读章节");
  }

  return chapters;
}

function extractCover(
  files: ZipFiles,
  opfDir: string,
  opfXml: string,
  manifest: Map<string, ManifestItem>,
): ParseCover | undefined {
  // EPUB3: properties="cover-image"
  for (const item of manifest.values()) {
    if (/\bcover-image\b/i.test(item.properties)) {
      const c = loadCoverItem(files, opfDir, item);
      if (c) return c;
    }
  }

  // EPUB2: <meta name="cover" content="id"/>
  const metaCover = opfXml.match(
    /<meta\b[^>]*name\s*=\s*["']cover["'][^>]*content\s*=\s*["']([^"']+)["'][^>]*\/?>/i,
  ) || opfXml.match(
    /<meta\b[^>]*content\s*=\s*["']([^"']+)["'][^>]*name\s*=\s*["']cover["'][^>]*\/?>/i,
  );
  if (metaCover) {
    const item = manifest.get(metaCover[1]);
    if (item) {
      const c = loadCoverItem(files, opfDir, item);
      if (c) return c;
    }
  }

  // 启发式：id/href 含 cover 的图片
  for (const item of manifest.values()) {
    if (!isImageMedia(item.mediaType, item.href)) continue;
    if (/cover/i.test(item.id) || /cover/i.test(item.href)) {
      const c = loadCoverItem(files, opfDir, item);
      if (c) return c;
    }
  }

  return undefined;
}

function loadCoverItem(
  files: ZipFiles,
  opfDir: string,
  item: ManifestItem,
): ParseCover | undefined {
  const path = resolveZipPath(opfDir, item.href);
  const bytes = readFileOptional(files, path);
  if (!bytes || bytes.byteLength === 0) return undefined;
  const contentType =
    item.mediaType || guessImageMime(item.href) || "application/octet-stream";
  return { bytes, contentType };
}

function isDocumentMedia(mediaType: string, href: string): boolean {
  const mt = mediaType.toLowerCase();
  if (mt === "image/svg+xml") return false;
  if (mt.includes("html")) return true;
  if (
    mt.includes("xml") &&
    (/\.xhtml$/i.test(href) || /\.html?$/i.test(href))
  ) {
    return true;
  }
  return /\.(xhtml|html|htm)$/i.test(href);
}

function isImageMedia(mediaType: string, href: string): boolean {
  if (mediaType.toLowerCase().startsWith("image/")) return true;
  return /\.(png|jpe?g|gif|webp|svg|bmp)$/i.test(href);
}

function chapterTitleFromHtml(xhtml: string): string | null {
  // 优先 body 内 h1–h3
  const body = xhtml.match(/<body\b[^>]*>([\s\S]*?)<\/body>/i)?.[1] ?? xhtml;
  const h = body.match(/<h[1-3]\b[^>]*>([\s\S]*?)<\/h[1-3]>/i);
  if (h) {
    const t = stripTags(h[1]).trim();
    if (t) return decodeXmlEntities(t);
  }
  const title = firstXmlText(xhtml, /<title[^>]*>([\s\S]*?)<\/title>/i);
  if (title?.trim()) return decodeXmlEntities(title.trim());
  return null;
}

/** HTML → 纯文本；段落 \n\n */
function htmlToText(html: string): string {
  let s = html;
  // 去 script / style
  s = s.replace(/<script\b[\s\S]*?<\/script>/gi, "");
  s = s.replace(/<style\b[\s\S]*?<\/style>/gi, "");
  // 去掉 head
  s = s.replace(/<head\b[\s\S]*?<\/head>/gi, "");
  // 块级 / 换行
  s = s.replace(/<br\s*\/?>/gi, "\n");
  s = s.replace(/<\/(p|div|h[1-6]|li|tr|blockquote|section|article)>/gi, "\n\n");
  s = s.replace(/<\/(td|th)>/gi, "\t");
  s = s.replace(/<hr\b[^>]*\/?>/gi, "\n\n");
  // 去其余标签
  s = s.replace(/<[^>]+>/g, "");
  s = decodeXmlEntities(s);
  // 规范化空白
  s = s.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  s = s
    .split("\n")
    .map((line) => line.replace(/[ \t\u00a0]+/g, " ").trimEnd())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return s;
}

function stripTags(s: string): string {
  return s.replace(/<[^>]+>/g, "");
}

function decodeXmlEntities(s: string): string {
  return s
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => {
      const cp = parseInt(h, 16);
      return Number.isFinite(cp) ? String.fromCodePoint(cp) : _;
    })
    .replace(/&#(\d+);/g, (_, d) => {
      const cp = parseInt(d, 10);
      return Number.isFinite(cp) ? String.fromCodePoint(cp) : _;
    })
    .replace(/&nbsp;/gi, " ")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&apos;/gi, "'")
    .replace(/&amp;/gi, "&");
}

function firstXmlText(xml: string, re: RegExp): string | null {
  const m = xml.match(re);
  if (!m) return null;
  return stripTags(m[1]).trim() || null;
}

function attr(attrs: string, name: string): string | null {
  const re = new RegExp(`${name}\\s*=\\s*["']([^"']*)["']`, "i");
  const m = attrs.match(re);
  return m ? m[1] : null;
}

function decodeUtf8(bytes: Uint8Array): string {
  return new TextDecoder("utf-8", { fatal: false, ignoreBOM: true }).decode(bytes);
}

function readFile(files: ZipFiles, path: string): Uint8Array {
  const data = readFileOptional(files, path);
  if (!data) throw new Error(`EPUB 缺少文件：${path}`);
  return data;
}

function readFileOptional(files: ZipFiles, path: string): Uint8Array | undefined {
  const n = normalizeZipPath(path);
  if (files[n]) return files[n];
  const found = Object.keys(files).find((p) => p.toLowerCase() === n.toLowerCase());
  return found ? files[found] : undefined;
}

function normalizeZipPath(p: string): string {
  return p.replace(/\\/g, "/").replace(/^\/+/, "").replace(/\/+/g, "/");
}

function dirnamePath(p: string): string {
  const n = normalizeZipPath(p);
  const i = n.lastIndexOf("/");
  return i >= 0 ? n.slice(0, i) : "";
}

function resolveZipPath(baseDir: string, href: string): string {
  // 去掉 query/hash
  const clean = href.split("#")[0].split("?")[0];
  const joined = baseDir ? `${baseDir}/${clean}` : clean;
  const parts = normalizeZipPath(joined).split("/");
  const stack: string[] = [];
  for (const part of parts) {
    if (!part || part === ".") continue;
    if (part === "..") {
      stack.pop();
      continue;
    }
    stack.push(part);
  }
  return stack.join("/");
}

function titleFromFilename(filename: string): string {
  const base = filename.replace(/^.*[/\\]/, "");
  const dot = base.lastIndexOf(".");
  return (dot > 0 ? base.slice(0, dot) : base) || base;
}

function guessImageMime(href: string): string | null {
  const lower = href.toLowerCase();
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".gif")) return "image/gif";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".svg")) return "image/svg+xml";
  return null;
}

