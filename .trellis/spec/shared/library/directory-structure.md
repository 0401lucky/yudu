# 目录结构 — @yudu/shared

## 布局

```
packages/shared/
├── package.json          # name: @yudu/shared；main/types → ./src/index.ts
├── tsconfig.json
├── vitest.config.ts
└── src/
    ├── index.ts          # export * from constants / types / filenameSeries
    ├── constants.ts      # 上限、格式、Cookie 名、会话天数
    ├── types.ts          # 公共 DTO 与 ApiErrorBody
    ├── filenameSeries.ts # 书名-序号解析与分组
    └── filenameSeries.test.ts
```

## 文件职责

| 文件 | 放什么 |
|------|--------|
| `constants.ts` | 前后端都必须一致的字面量与 `as const` 列表 |
| `types.ts` | 跨端 JSON 形状；可引用 constants 中的类型 |
| `filenameSeries.ts` | 无 I/O 的文件名算法 + 导出类型 |
| `index.ts` | 仅 re-export，不写逻辑 |

## 新增模块规则

1. 新文件放在 `src/`，并在 `index.ts` `export *`
2. 仅当 **web 与 api 至少一方将共用** 时才进 shared
3. 单端逻辑（分页 DOM、PBKDF2、R2 key）留在各自包

## 命名

- 类型：`PascalCase`（`BookSummary`、`UserPreferences`）
- 常量：`SCREAMING_SNAKE`（`MAX_UPLOAD_BYTES`、`SESSION_COOKIE`）
- 函数：camelCase（`parseFilenameSeries`、`seriesGroupKey`）

## 反模式

- 在 shared 使用 `window` / `document` / `c.env`
- 为「可能将来共用」提前塞工具函数
- 深层路径导出（外部应只从 `@yudu/shared` 导入）
