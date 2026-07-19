# 产品定位：通用阅读器

## Goal

将雨读从「在线小说阅读器」调整为 **通用在线阅读器** 的文档与 Trellis 规范表述，方便后续 PDF 等格式扩展，并让其他 AI 对接时读到一致定位。

## Requirements

- R1. README / 落地页 / 关键 UI 文案去掉「仅小说」定位，改为通用阅读。
- R2. `.trellis/spec` 增加权威产品定位文档，并挂到 guides 索引。
- R3. 包级 spec（web/api/shared）摘要与解析器扩展说明对齐通用阅读器。
- R4. 历史设计文档标注定位已迁移，避免 AI 仍按「小说专用」理解。
- R5. 不改 D1 库名等基础设施 ID；不实现 PDF（仅预留与文档约定）。

## Acceptance Criteria

- [x] 存在 `.trellis/spec/guides/product-positioning.md` 且被 guides/index 引用
- [x] README、落地页、meta 描述体现通用阅读器
- [x] 历史 novel 设计文档有「定位已更新」说明
- [x] 扩展 PDF 的 checklist 写在 positioning 文档中

## Out of Scope

- PDF 解析与渲染实现
- 重命名 Cloudflare D1 `novel-reading-platform-db`
- 领域类型 Book → Document 的大规模重命名
