# AI 小说创作台 — 实现计划

## 建议执行顺序

> 可在同一任务内按阶段推进；若要拆子任务，按下表 Child 列建 child 并 `--parent 07-29-ai-novel-studio`。

| 阶段 | 内容 | 验证 | 可选 Child |
|------|------|------|------------|
| P0 | shared 类型 + DB migration（source/on_shelf/break_limit）+ 书架列表过滤兼容 | migration 与类型检查 | `studio-data-model` |
| P1 | API：studio 建书/列表/PATCH、assets GET/PUT、上架、章节写/追加 | api 单测 | `studio-api` |
| P2 | Web：本地 AI 配置 + aiClient 流式（mock 可测） | 单元/手工 mock | `studio-ai-client` |
| P3 | Web：创作台列表 + 立项/人设/大纲/细纲 CRUD 接 API | 手工闭环 | `studio-workflow-ui` |
| P4 | Web：逐章编辑 + 流式生成 + 保存；破限确认 | 接真实 new-api 手工 | `studio-chapter-gen` |
| P5 | 导航与书架「继续创作」/「去阅读」；回归导入书 | 全链路验收 AC1–AC10 | `studio-shelf-nav` |

**依赖：** P1 依赖 P0；P3/P4 依赖 P1+P2；P5 依赖 P3+P4。

## 实现清单（总）

### 数据与 shared

- [ ] 扩展 Book 相关类型：`source`、`onShelf`、`breakLimit`
- [ ] D1 migration：新列 + 旧行默认（import / on_shelf=1）
- [ ] `StudioAssets` 类型放入 shared 或 api 内聚（若仅 api/web 使用可放 shared 便于两端）

### API

- [ ] `GET/POST /api/studio/books`
- [ ] `GET/PATCH /api/studio/books/:id`
- [ ] `GET/PUT /api/studio/books/:id/assets`
- [ ] `POST /api/studio/books/:id/shelf`
- [ ] 章节写：`PUT .../chapters/:idx`、`POST .../chapters`（仅 studio）
- [ ] `GET /api/books` 仅返回 on_shelf（兼容旧数据）
- [ ] 测试：属主、过滤、import 不可写

### Web

- [ ] 路由与导航入口
- [ ] AI 设置 localStorage
- [ ] `aiClient` stream + AbortController
- [ ] 提示词模板（含破限/禁止未成年）
- [ ] 工作流各步 UI + 保存
- [ ] 章节编辑器 + 流式填入 + 重生成
- [ ] 上架/下架；书架与创作台跳转
- [ ] 成年确认 UX

### 文档

- [ ] 设置页或 README 片段：new-api CORS 说明
- [ ] 产品定位：可选一句「支持 AI 创作台（含成人向自配模型）」——实现末期再改 spec，避免提前扩写

## 验证命令

```bash
# 按仓库既有脚本调整
pnpm --filter @yudu/shared exec tsc --noEmit
pnpm --filter @yudu/api test
pnpm --filter @yudu/web test
# 或根目录
pnpm test
pnpm lint
```

手工：

1. 配置真实 new-api，破限书生成一章 18+ 文本并上架阅读。
2. 改章后再读，确认更新。
3. 下架/再上架与进度。
4. 导入书回归。

## 风险与回滚点

| 风险 | 缓解 |
|------|------|
| new-api CORS 失败 | 设置页明确报错与配置说明；另任务做 Workers 代理 |
| 书架过滤漏掉旧书 | migration 默认 on_shelf=1；单测覆盖 null/旧行 |
| 写章与 R2/索引不一致 | 复用 import 写章路径或抽共享 storage 帮助函数 |
| 长章流式内存/超时 | 仅浏览器侧流式；保存整章一次 PUT |
| Workers 无 AI 代理后 CPU 无此压 | 保持 V1 不代理 |

回滚：功能旗标或隐藏 `/studio` 路由 + API 返回 404；不删列。

## task.py start 前检查

- [x] prd.md 已收敛（无阻塞 Open Questions）
- [x] design.md 已写
- [x] implement.md 已写
- [ ] 主人确认可 `task.py start` 进入实现（**当前仅建任务与规划，未 start**）

## 实现期注意

- 开工前跑 `trellis-before-dev`，读 web/api/shared 对应 spec index。
- 不扩大范围到 Out of Scope。
- 破限相关文案与提示词保留「禁止未成年人相关性内容」。
