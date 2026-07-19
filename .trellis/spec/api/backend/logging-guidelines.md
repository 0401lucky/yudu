# 日志约定 — @yudu/api

## 现状（以代码为准）

**API 包几乎不写结构化日志。** 错误通过 HTTP JSON 返回；成功路径静默。

- `apps/api/src` 内无统一 logger，无 `console.log` 作为常规可观测性方案
- 导入调试日志在**前端** `LibraryPage` / `ImportDropzone` 的 `console.info` / `console.error`，不在 Worker

Workers 运行时未捕获异常会进入 Cloudflare 平台日志；应用层不额外包装。

## 当前实践

| 场景 | 做法 |
|------|------|
| 可预期业务失败 | `c.json({ error: ... }, 4xx)`，不打 log |
| 不可预期失败 | `throw err` 或让 Promise 拒绝，依赖平台 |
| 安全相关 | 不记录明文密码、原始 session token |

## 若必须加日志

保持最小：

1. 优先记录 **code + bookId/userId 等非敏感 id**，不记正文与密码
2. 使用 `console.warn` / `console.error`（Workers 兼容），消息前缀可带 `[yudu]`
3. 不要为每个成功 GET 打 info（费用与噪音）
4. 不要引入未在 `package.json` 声明的重型日志库，除非任务明确要求

## 反模式

- `console.log(password)` / 打印完整 Cookie
- 假设存在 pino/winston 中间件（当前没有）
- 用日志代替返回给客户端的 `error.message`
