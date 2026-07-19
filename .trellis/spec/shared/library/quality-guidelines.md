# 质量约定 — @yudu/shared

## 纯函数与可测性

- 无 I/O、无全局可变状态
- 文件名解析等必须有 vitest 用例（`filenameSeries.test.ts` 为样板）
- 中文场景：`localeCompare(..., "zh")`、系列书名 trim

## 类型导出

- 用 `export type` / `export interface` / `export const`
- `BookFormat` 由 `SUPPORTED_FORMATS` 推导并扩展 pdf，避免字符串联合分叉维护

## 兼容性

代码须同时可被：

- Cloudflare Workers（api 打包）
- Vite 浏览器包（web）

避免：`node:fs`、`Buffer`（除非确认双边可用且必要）、仅浏览器 API。

## 版本与发布

包为 private monorepo workspace，**不**独立 npm publish。破坏性变更靠同一 PR 改掉所有调用方。

## 测试命令

```bash
pnpm --filter @yudu/shared test
pnpm test   # 根脚本会跑各包
```

## 反模式

- shared 里 `console.log`
- 为单测 mock 网络（此处不应有网络）
- 复制 api 的 `ImportValidationError` 到 shared（错误类属服务端实现细节；**code 字符串**才是契约）
