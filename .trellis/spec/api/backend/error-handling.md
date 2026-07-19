# 错误处理 — @yudu/api

## 统一响应体

与 `@yudu/shared` 的 `ApiErrorBody` 对齐：

```typescript
{ error: { code: string; message: string } }
```

成功响应直接返回资源 JSON（`UserPublic`、`BookSummary[]` 等），**不要**包一层 `{ data: ... }`。

无内容：`c.body(null, 204)`（登出、删书）。

## HTTP 状态与 code 惯例

| 场景 | status | code 示例 | 出处 |
|------|--------|-----------|------|
| JSON/表单解析失败 | 400 | `INVALID_BODY` | auth / progress / preferences / import |
| 字段校验失败 | 400 | `VALIDATION_ERROR`、`INVALID_PROGRESS`、`INVALID_PREF` | 各路由 |
| 缺文件 / 过大 / 格式 | 400 | `MISSING_FILE`、`FILE_TOO_LARGE`、`UNSUPPORTED_FORMAT`、`EMPTY_FILE` | import |
| 未登录 | 401 | `UNAUTHORIZED` | authMiddleware、me |
| 邮箱或密码错误 | 401 | `INVALID_CREDENTIALS` | login（不暴露是否存在邮箱） |
| 邮箱已注册 | 409 | `EMAIL_TAKEN` | register |
| 资源不存在或非本人 | 404 | `NOT_FOUND` | books / progress / chapters |
| 章节存储缺失/损坏 | 404/500 | `STORAGE_MISSING`、`STORAGE_CORRUPT` | chapters |
| 未知 /api 路径 | 404 | `NOT_FOUND` | index.ts |
| 导入部分成功 | 200 | （body 为 summaries，含 failed） | import；全 ready 时 201 |

`message` 使用**简体中文**用户可读文案（如「请先登录」「书籍不存在」）。

## 校验错误类

可预期的业务校验用自定义 Error，由路由捕获：

```typescript
// services/importBook.ts
export class ImportValidationError extends Error {
  readonly code: string;
  // ...
}

// routes/books.ts
catch (err) {
  if (err instanceof ImportValidationError) {
    return c.json({ error: { code: err.code, message: err.message } }, 400);
  }
  throw err; // 交给运行时；勿吞掉未知错误
}
```

密码/会话等内部失败：校验失败返回 false/null，不把哈希细节泄露到响应。

## 路由内校验模式

1. `try { body = await c.req.json() } catch { return 400 INVALID_BODY }`
2. 类型与范围检查后返回具体 code
3. 先查资源所有权，再写库

参考：`routes/progress.ts`、`routes/preferences.ts`、`routes/auth.ts` 的 `parseCredentials`。

## 鉴权失败

`middleware/auth.ts`：无 Cookie 或会话无效 → 固定

```json
{ "error": { "code": "UNAUTHORIZED", "message": "请先登录" } }
```

不要在 401 中区分「token 过期」与「从未登录」（当前实现一致）。

## 反模式

- `throw new Error("...")` 作为唯一错误路径且不映射 code（前端 `ApiError` 无法分类）
- 成功包装 `{ success: true, data }` 与现有客户端不一致
- 登录失败返回「用户不存在」等可枚举信息
- 把 `err.stack` 或 D1 原始错误字符串直接给客户端
