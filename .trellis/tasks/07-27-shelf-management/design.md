# 技术设计：书架管理

## 数据层

迁移 `apps/api/migrations/0006_book_groups.sql`（编号顺延，若 0005 已被 highlight-notes 占用）：

```sql
ALTER TABLE books ADD COLUMN group_name TEXT;
```

NULL = 未分组；空分组无实体，随最后一本书移出而自然消失。

## 共享层

- `constants.ts`：`MAX_BOOK_GROUP_CHARS = 30`。
- `types.ts`：`BookSummary` 增加 `createdAt: number`、`lastReadAt: number | null`、`group: string | null`。

## API 层（routes/books.ts）

1. **GET /api/books**：SELECT 增加 `created_at`、`group_name`，并 LEFT JOIN reading_progress（user_id + book_id）取 `updated_at AS last_read_at`。注意现有列表查询若已 join 进度算 progressPercent，则顺带取 updated_at 即可（实施时以现状为准，避免重复 join）。
2. **PATCH /api/books/:id**：新端点（或扩展现有更新端点，若无则新建），body `{ group: string | null }`；trim 后长度 1–30，否则 400 `INVALID_GROUP`；`null`/空串 = 移出分组。校验书属于当前用户，否则 404。
3. 响应统一带新字段。

## Web 层

1. **lib/api.ts**：`updateBookGroup(bookId, group: string | null)`。
2. **LibraryPage** 状态新增：`sortBy`（localStorage 键 `yudu:shelf-sort`）、`activeGroup`（"all" | 组名）、`manageMode: boolean`、`selected: Set<string>`。
   - 排序纯前端：`lastReadAt ?? -1` 降序 / `createdAt` 降序 / `title.localeCompare(t, "zh")`。
   - 分组 tabs 由 books 派生（`Map<group, count>`）。
3. **工具栏组件 ShelfToolbar**（新组件）：排序 Segmented/下拉 + 分组 tabs + 「管理」切换按钮。
4. **管理模式**：BookCard 增加 `selectable/selected/onToggle` props（复选浮层，点击卡片即勾选，不进阅读器）；底部浮动操作条（选中数、全选、移动到分组、删除、退出）。
   - 移动到分组：小弹层列出现有分组 + 「新建分组」输入；对每本选中书串行 PATCH。
   - 批量删除：`confirm` 二次确认后串行 `deleteBook`，收集失败书名统一报错，成功的即时从列表移除。

## 兼容与回滚

- 加列迁移可安全回滚；旧数据 group_name 为 NULL 即「未分组」，无回填。
