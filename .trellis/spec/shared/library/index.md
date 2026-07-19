# @yudu/shared 共享库指南

> 前后端共用的类型、常量与纯函数。包路径：`packages/shared`。  
> 契约服务 **通用阅读器**（`SUPPORTED_FORMATS`、进度 DTO 等）。  
> 产品定位：[../../guides/product-positioning.md](../../guides/product-positioning.md)

---

## 定位

| 是 | 不是 |
|----|------|
| API 与 SPA 的 **契约层** | React 组件或 Hono 路由 |
| 可在 Workers 与浏览器运行的 **纯 TS** | Node-only / DOM-only API |
| 常量与文件名系列解析 | D1 访问、R2、Cookie 写入 |
| `BookFormat` 含预留 `pdf` | 在此包实现 PDF 解析 |

依赖：无 runtime dependencies；仅 TypeScript + vitest。

入口：`packages/shared/src/index.ts` 再导出 `constants`、`types`、`filenameSeries`。

---

## 指南索引

| 指南 | 说明 |
|------|------|
| [目录结构](./directory-structure.md) | 文件职责与导出 |
| [类型与常量契约](./type-contracts.md) | DTO、错误体、格式与会话常量 |
| [质量约定](./quality-guidelines.md) | 测试、变更影响面、禁止模式 |

---

## 谁依赖谁

```
@yudu/web  ──imports──►  @yudu/shared
@yudu/api  ──imports──►  @yudu/shared
@yudu/shared  ──✕──►  web / api   （禁止）
```

workspace 协议：`"@yudu/shared": "workspace:*"`；源码直出 `exports: { ".": "./src/index.ts" }`。

---

## 验证命令

```bash
pnpm --filter @yudu/shared test
pnpm --filter @yudu/shared typecheck
```
