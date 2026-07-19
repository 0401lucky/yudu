# 思考指南（雨读）

> 编码前用来避免「没想到」的跨层与重复实现问题。  
> **产品是通用在线阅读器**（非仅小说）。对接本仓库的 AI 请先读产品定位。

---

## 产品定位（必读）

| 文档 | 用途 |
|------|------|
| [**产品定位**](./product-positioning.md) | 雨读是什么 / 不是什么、当前格式、PDF 扩展清单、文案约定 |

**一句话：** 云端文库 + 多格式沉浸阅读；`Book` = 任意可导入作品，不限小说。

---

## 本仓库架构速记

```
浏览器 SPA (@yudu/web)     通用阅读客户端
    │  Cookie 会话 + JSON / multipart
    ▼
Worker Hono (@yudu/api)    导入 / 分章 / 进度 / 鉴权
    ├─ D1：用户 / 作品元数据 / 进度 / 偏好
    └─ R2：章节 JSON / 封面 / 源文件
共享契约：@yudu/shared     格式枚举、DTO、文件名系列
当前格式：txt | md | epub   预留：pdf（未实现）
```

---

## 可用指南

| 指南 | 何时使用 |
|------|----------|
| [产品定位](./product-positioning.md) | 新功能范围、文案、新格式（含 PDF） |
| [跨层思考](./cross-layer-thinking-guide.md) | 改 API 字段、进度/偏好、导入合并、鉴权 |
| [复用思考](./code-reuse-thinking-guide.md) | 新常量、新校验、文件名规则、重复 fetch 逻辑 |

---

## 触发清单

### 产品 / 格式

- [ ] 新增可读格式（如 PDF）→ 先读 [产品定位 · 扩展清单](./product-positioning.md)
- [ ] 改导入白名单或 `SUPPORTED_FORMATS` → shared + api + web 三处对齐
- [ ] 写用户可见文案 → 避免「仅小说」措辞

### 跨层

- [ ] 新增或重命名 JSON 字段
- [ ] 改 D1 列或迁移
- [ ] 改错误 `code` / 状态码
- [ ] 导入格式或系列文件名规则变化
- [ ] Cookie / CORS / 同源部署行为变化

### 复用

- [ ] 准备写 `MAX_*`、格式列表、主题枚举
- [ ] 准备在 web 与 api 各写一遍校验
- [ ] 准备新的 `fetch("/api/...")` 而不改 `lib/api.ts`
- [ ] 准备新的 R2 key 字符串模板

### 改值前必搜

```bash
# 示例：改会话 Cookie 名或上传上限
rg "yudu_session|MAX_UPLOAD_BYTES|SESSION_DAYS" .
```

---

## AI 评审常见误报（本项目）

1. **信任边界**：D1/R2 中已按 `user_id` 隔离的数据 ≠ 未校验用户输入；但 **上传文件与 JSON body** 仍是不可信输入。
2. **本地书签 / 本地偏好**：故意不进云端，不是「漏做同步」。
3. **进度 charOffset 近似**：阅读器按页比例估算，供书架百分比，不是精确字符光标。
4. **FormData Content-Type**：故意不设，以便浏览器带 boundary。

---

**原则**：先画数据流与契约，再写代码。30 分钟思考胜过 3 小时对字段。
