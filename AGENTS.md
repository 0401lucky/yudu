# 雨读 · 项目说明（给 AI）

**产品：** 雨读（Yudu）— **通用在线阅读器**（非仅小说）。  
**能力：** 账号云同步、导入 txt/md/epub、左右翻页；**PDF 等格式规划中**。  
**权威定位：** `.trellis/spec/guides/product-positioning.md`（与历史「小说阅读器」文档冲突时以该文件为准）。  
**栈：** `apps/web` + `apps/api` + `packages/shared`；Cloudflare Workers + D1 + R2。

对接顺序建议：

1. `product-positioning.md` → `guides/index.md`  
2. 目标包 `.trellis/spec/<package>/<layer>/index.md`  
3. `.trellis/workflow.md` 任务流  

---

<!-- TRELLIS:START -->
# Trellis Instructions

These instructions are for AI assistants working in this project.

This project is managed by Trellis. The working knowledge you need lives under `.trellis/`:

- `.trellis/workflow.md` — development phases, when to create tasks, skill routing
- `.trellis/spec/` — package- and layer-scoped coding guidelines (read before writing code in a given layer)
- `.trellis/spec/guides/product-positioning.md` — **product identity (general reader; not novel-only)**
- `.trellis/workspace/` — per-developer journals and session traces
- `.trellis/tasks/` — active and archived tasks (PRDs, research, jsonl context)

If a Trellis command is available on your platform (e.g. `/trellis:finish-work`, `/trellis:continue`), prefer it over manual steps. Not every platform exposes every command.

If you're using Codex or another agent-capable tool, additional project-scoped helpers may live in:
- `.agents/skills/` — reusable Trellis skills
- `.codex/agents/` — optional custom subagents

Managed by Trellis. Edits outside this block are preserved; edits inside may be overwritten by a future `trellis update`.

<!-- TRELLIS:END -->
