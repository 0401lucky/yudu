# Task 6 报告：TXT / MD 解析器（TDD）

## Status

**完成**

## 变更摘要

| 操作 | 路径 |
|------|------|
| 新建 | `apps/api/src/parsers/types.ts` |
| 新建 | `apps/api/src/parsers/txt.ts` |
| 新建 | `apps/api/src/parsers/txt.test.ts` |
| 新建 | `apps/api/src/parsers/md.ts` |
| 新建 | `apps/api/src/parsers/md.test.ts` |
| 新建 | `apps/api/fixtures/sample.txt` |
| 新建 | `apps/api/fixtures/sample.md` |
| 新建 | `apps/api/fixtures/sample-gbk.txt`（GBK 二进制样例） |

### 接口（`parsers/types.ts`）

- `ParsedChapter`：`title` + `text`（纯文本，段落 `\n\n`）
- `ParseResult`：`title` / `author: string | null` / `chapters`

### `parseTxt`

- 编码：`TextDecoder('utf-8', { fatal, ignoreBOM })` → 失败则 `gbk` fatal → 再失败 throw
- 分章优先级：
  1. `^第[零一二三四五六七八九十百千0-9]+章`
  2. `^Chapter\s+\d+`（i）
  3. Markdown 行首 `#{1,6}`
- 无匹配：整本一章，`title` = 文件名去扩展名
- 正文前非空前言 → 章节「前言」
- 书名：文件名去扩展名；`author` 恒 `null`

### `parseMd`

- 去掉开头 YAML front matter（`---` … `---`）
- 分章：**优先 `## ` 且至少 2 个**；否则用 `# `（≥1）；都没有则整篇一章，title=文件名
- 剥离简单 MD：`**` / `*` / 行内 `` ` `` / 链接 `[text](url)` / 残留 ATX `#`
- `author` 恒 `null`（未解析 front matter 元数据）

## TDD 证据

### RED

测试与 fixtures 先于实现落地；`parseTxt` / `parseMd` 模块不存在时：

```
FAIL  src/parsers/md.test.ts
Error: Failed to load url ./md ... Does the file exist?
FAIL  src/parsers/txt.test.ts
Error: Failed to load url ./txt ... Does the file exist?
Test Files  2 failed | 3 passed
```

### GREEN

实现后：

```
pnpm --filter @yudu/api test
→ Test Files  5 passed (5)
→ Tests  21 passed (21)
  - parsers/txt.test.ts  5
  - parsers/md.test.ts   5
  - 既有 auth/password/session 11

pnpm --filter @yudu/api typecheck
→ 通过（tsc --noEmit）
```

## Commits

- `0f237bb` — `feat(api): txt 与 md 解析器`
  - 8 files changed, 437 insertions(+)

## Test Summary

| 套件 | 用例 | 结果 |
|------|------|------|
| parseTxt | 第×章分章 / 无标题整本 / Chapter N / GBK / 非法编码 throw | 5 通过 |
| parseMd | ## 优先 / 去 MD 标记 / 单 ## 回退 # / 无标题 / 去 front matter | 5 通过 |
| 既有 | password / session / auth routes | 11 通过 |
| typecheck | `tsc --noEmit` | 通过 |

## Concerns

1. **Workers 运行时 GBK**：本机 Node 的 `TextDecoder('gbk')` 可用；Cloudflare Workers 需确认已开 `nodejs_compat`（或等价）后再在真实 Worker 验证，否则 GBK 路径会 throw。
2. **GBK fixture 与 CRLF**：`sample-gbk.txt` 为二进制；Windows 上 Git 可能提示 LF→CRLF。单元测试已内嵌 hex 字节，不依赖磁盘该文件的换行；若后续从磁盘读入，建议 `.gitattributes` 标为 `binary`。
3. **MD front matter 元数据未提取**：`title`/`author` 仍来自文件名 / `null`，未读 YAML 字段（符合 brief 最小范围）。
4. **TXT 前言策略**：首个分章标记前的非空内容会生成「前言」章；若产品不需要可后续改为丢弃。
5. **MD 仅 1 个 `##` 且无 `#`**：按规则整篇一章（不把单个 `##` 当目录），与「至少 2 个 ##」一致。
