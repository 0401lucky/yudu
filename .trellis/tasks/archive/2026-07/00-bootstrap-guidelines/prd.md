# Bootstrap Task: Fill Project Development Guidelines

**状态：指南已按真实代码库填写完成（2026-07-19）。**

---

## Status

- [x] Fill guidelines for @yudu/api
- [x] Fill guidelines for @yudu/web
- [x] Fill guidelines for @yudu/shared
- [x] Add code examples（引用真实路径与符号，非空模板）

---

## 最终 spec 结构（相对 init 模板的调整）

模板里的 `api/frontend`、`shared/backend`、`shared/frontend` **已删除**——与仓库不符：

| 包 | 实际层 | 路径 |
|----|--------|------|
| `@yudu/api` | Workers 后端 only | `.trellis/spec/api/backend/` |
| `@yudu/web` | React SPA only | `.trellis/spec/web/frontend/` |
| `@yudu/shared` | 纯 TS 契约库 | `.trellis/spec/shared/library/` |
| 跨包 | 思考指南 | `.trellis/spec/guides/` |

### @yudu/api backend

- `index.md`、`directory-structure.md`、`database-guidelines.md`
- `error-handling.md`、`quality-guidelines.md`、`logging-guidelines.md`

### @yudu/web frontend

- `index.md`、`directory-structure.md`、`component-guidelines.md`
- `hook-guidelines.md`、`state-management.md`、`type-safety.md`、`quality-guidelines.md`

### @yudu/shared library

- `index.md`、`directory-structure.md`、`type-contracts.md`、`quality-guidelines.md`

### Guides

- `index.md`、`cross-layer-thinking-guide.md`、`code-reuse-thinking-guide.md`（已按雨读数据流定制）

---

## 分析依据

- monorepo：`apps/api`（Hono + D1 + R2）、`apps/web`（Vite React）、`packages/shared`
- 设计文档：`docs/superpowers/specs/2026-07-11-novel-reader-design.md`
- 源码模式：Cookie 会话、`ApiErrorBody`、导入系列合并、客户端分页、CSS 变量双主题

---

## Completion

开发者确认无误后可执行：

```bash
python ./.trellis/scripts/task.py finish
python ./.trellis/scripts/task.py archive 00-bootstrap-guidelines
```

之后新成员将得到 join 任务而非本 bootstrap 任务。
