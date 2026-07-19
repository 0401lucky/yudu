# Task 7 报告：EPUB 解析器（TDD）

## Status

**完成**

## 变更摘要

| 操作 | 路径 |
|------|------|
| 新建 | `apps/api/src/parsers/epub.ts` |
| 新建 | `apps/api/src/parsers/epub.test.ts` |
| 新建 | `apps/api/fixtures/minimal.epub` |
| 修改 | `apps/api/src/parsers/types.ts`（可选 `cover`） |
| 修改 | `apps/api/package.json` / `pnpm-lock.yaml`（依赖 `fflate`） |

### 接口

```ts
parseEpub(bytes: Uint8Array, filename: string): Promise<ParseResult>

// ParseResult 扩展
cover?: { bytes: Uint8Array; contentType: string }
```

### `parseEpub` 流程

1. **fflate `unzipSync`** 解压 ZIP，路径规范化（`/`、大小写不敏感回退）
2. 读 `META-INF/container.xml` → `rootfile full-path` 定位 OPF
3. 解析 OPF：`dc:title` / `dc:creator`、manifest、spine `itemref`
4. 按 spine 顺序加载 xhtml/html → `htmlToText` 提纯文本
5. 章节标题：body 内 `h1–h3` → 否则 `<title>` → 否则 item id
6. **封面**：EPUB3 `properties=cover-image` → EPUB2 `<meta name="cover">` → id/href 含 cover 的图片

### HTML 清洗

- 去 `<script>` / `<style>` / `<head>`
- `<br>` → `\n`；`</p>` 等块级 → `\n\n`
- 去剩余标签；解码 `&nbsp;` / `&lt;` / `&gt;` / `&amp;` / `&quot;` / `&apos;` / `&#…;` / `&#x…;`
- 折叠空白与多余空行

### Fixture `minimal.epub`

手写最小 ZIP（fflate `zipSync` 生成）：

- `mimetype`（store，level 0）`application/epub+zip`
- `META-INF/container.xml`
- `OEBPS/content.opf`（title/author/cover meta + spine 一章）
- `OEBPS/chapter1.xhtml`（含 script/style 与实体，供清洗断言）
- `OEBPS/cover.png`（1×1 PNG）

## TDD 证据

### RED

`epub.test.ts` 先于 `epub.ts`：

```
FAIL  src/parsers/epub.test.ts
Error: Failed to load url ./epub ... Does the file exist?
Test Files  1 failed
```

### GREEN

```
pnpm --filter @yudu/api test
→ Test Files  6 passed (6)
→ Tests  26 passed (26)
  - parsers/epub.test.ts  5
  - parsers/txt + md      10
  - 既有 auth/password/session 11

pnpm --filter @yudu/api typecheck
→ 通过（tsc --noEmit）
```

## Commits

- `c6950e0` — `feat(api): epub 解析器`
  - 6 files changed, 450 insertions(+)

## Test Summary

| 套件 | 用例 | 结果 |
|------|------|------|
| parseEpub | chapters≥1 + 元数据/正文/无 HTML 泄漏 | 通过 |
| parseEpub | 基础 HTML 实体解码 | 通过 |
| parseEpub | 提取 cover PNG | 通过 |
| parseEpub | 损坏 zip throw | 通过 |
| parseEpub | 有元数据时 title 优先于文件名 | 通过 |
| 既有 | txt/md/password/session/auth | 21 通过 |
| typecheck | `tsc --noEmit` | 通过 |

## Concerns

1. **简易 XML 正则解析**：未用完整 XML DOM；命名空间前缀写死 `dc:`、属性顺序宽松匹配。极端畸形 OPF 可能失败，对常见网文 epub 通常够用。
2. **未解析 TOC/NCX/nav**：章节标题依赖正文标题或 `<title>`，不一定等于目录名。
3. **多章 spine 中非文档项**（如封面页 xhtml 仅含图）若无文本会被跳过；若只有图且无文字可能 throw「未找到可读章节」。
4. **封面未做格式转换**：原样返回 bytes + media-type；WebP 转码留给 Task 8 `cover` 服务。
5. **ZIP 炸弹 / 超大 epub**：未在解析层限条目数或解压体积；上传层 `MAX_UPLOAD_BYTES` 应兜底（Task 8）。
6. **测试内嵌 base64**：`epub.test.ts` 内嵌 fixture 的 base64，避免 Workers `tsconfig` 无 `node:fs` 类型；磁盘 `fixtures/minimal.epub` 仍保留作真源。
