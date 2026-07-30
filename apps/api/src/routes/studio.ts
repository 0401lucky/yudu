import type { StudioAssets } from "@yudu/shared";
import { Hono } from "hono";
import type { Env } from "../env";
import { authMiddleware, type AuthVariables } from "../middleware/auth";
import { calcProgressPercent } from "./books";
import {
  createStudioBook,
  getStudioBookDetail,
  listStudioBooks,
  patchStudioBook,
  putStudioAssets,
  setStudioOnShelf,
  StudioNotFoundError,
  StudioValidationError,
} from "../services/studioBook";

export const studioRoutes = new Hono<{
  Bindings: Env;
  Variables: AuthVariables;
}>();

studioRoutes.use("*", authMiddleware);

function handleStudioError(err: unknown): Response | null {
  if (err instanceof StudioValidationError) {
    return Response.json(
      { error: { code: err.code, message: err.message } },
      { status: 400 },
    );
  }
  if (err instanceof StudioNotFoundError) {
    return Response.json(
      { error: { code: "NOT_FOUND", message: err.message } },
      { status: 404 },
    );
  }
  return null;
}

/** GET /api/studio/books — 创作列表（含未上架） */
studioRoutes.get("/books", async (c) => {
  const userId = c.get("userId");
  const list = await listStudioBooks(c.env, userId, calcProgressPercent);
  return c.json(list);
});

/** POST /api/studio/books — 新建创作书 */
studioRoutes.post("/books", async (c) => {
  const userId = c.get("userId");
  let body: unknown = {};
  try {
    const text = await c.req.text();
    if (text) body = JSON.parse(text) as unknown;
  } catch {
    return c.json(
      { error: { code: "INVALID_BODY", message: "请求体不是合法 JSON" } },
      400,
    );
  }

  const title =
    body && typeof body === "object" && "title" in body
      ? (body as { title: unknown }).title
      : undefined;
  const breakLimit =
    body && typeof body === "object" && "breakLimit" in body
      ? Boolean((body as { breakLimit: unknown }).breakLimit)
      : false;

  try {
    const summary = await createStudioBook(
      c.env,
      userId,
      {
        title: typeof title === "string" ? title : undefined,
        breakLimit,
      },
      calcProgressPercent,
    );
    return c.json(summary, 201);
  } catch (err) {
    const res = handleStudioError(err);
    if (res) return res;
    throw err;
  }
});

/** GET /api/studio/books/:id */
studioRoutes.get("/books/:id", async (c) => {
  const userId = c.get("userId");
  const bookId = c.req.param("id");
  try {
    const detail = await getStudioBookDetail(c.env, userId, bookId);
    return c.json(detail);
  } catch (err) {
    const res = handleStudioError(err);
    if (res) return res;
    throw err;
  }
});

/** PATCH /api/studio/books/:id — 立项字段 */
studioRoutes.patch("/books/:id", async (c) => {
  const userId = c.get("userId");
  const bookId = c.req.param("id");
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json(
      { error: { code: "INVALID_BODY", message: "请求体不是合法 JSON" } },
      400,
    );
  }
  if (body == null || typeof body !== "object") {
    return c.json(
      { error: { code: "INVALID_BODY", message: "请求体无效" } },
      400,
    );
  }
  const o = body as Record<string, unknown>;
  try {
    const summary = await patchStudioBook(
      c.env,
      userId,
      bookId,
      {
        title: typeof o.title === "string" ? o.title : undefined,
        breakLimit:
          o.breakLimit === undefined ? undefined : Boolean(o.breakLimit),
        author:
          o.author === undefined
            ? undefined
            : o.author === null
              ? null
              : typeof o.author === "string"
                ? o.author
                : undefined,
        model:
          o.model === undefined
            ? undefined
            : o.model === null
              ? null
              : typeof o.model === "string"
                ? o.model
                : undefined,
        providerId:
          o.providerId === undefined
            ? undefined
            : o.providerId === null
              ? null
              : typeof o.providerId === "string"
                ? o.providerId
                : undefined,
      },
      calcProgressPercent,
    );
    return c.json(summary);
  } catch (err) {
    const res = handleStudioError(err);
    if (res) return res;
    throw err;
  }
});

/** GET /api/studio/books/:id/assets */
studioRoutes.get("/books/:id/assets", async (c) => {
  const userId = c.get("userId");
  const bookId = c.req.param("id");
  try {
    const detail = await getStudioBookDetail(c.env, userId, bookId);
    return c.json(detail.assets as StudioAssets);
  } catch (err) {
    const res = handleStudioError(err);
    if (res) return res;
    throw err;
  }
});

/** PUT /api/studio/books/:id/assets */
studioRoutes.put("/books/:id/assets", async (c) => {
  const userId = c.get("userId");
  const bookId = c.req.param("id");
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json(
      { error: { code: "INVALID_BODY", message: "请求体不是合法 JSON" } },
      400,
    );
  }
  try {
    const assets = await putStudioAssets(c.env, userId, bookId, body);
    return c.json(assets);
  } catch (err) {
    const res = handleStudioError(err);
    if (res) return res;
    throw err;
  }
});

/** POST /api/studio/books/:id/shelf  body: { onShelf: boolean } */
studioRoutes.post("/books/:id/shelf", async (c) => {
  const userId = c.get("userId");
  const bookId = c.req.param("id");
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json(
      { error: { code: "INVALID_BODY", message: "请求体不是合法 JSON" } },
      400,
    );
  }
  if (
    body == null ||
    typeof body !== "object" ||
    typeof (body as { onShelf?: unknown }).onShelf !== "boolean"
  ) {
    return c.json(
      { error: { code: "INVALID_BODY", message: "需要 boolean 字段 onShelf" } },
      400,
    );
  }
  try {
    const summary = await setStudioOnShelf(
      c.env,
      userId,
      bookId,
      (body as { onShelf: boolean }).onShelf,
      calcProgressPercent,
    );
    return c.json(summary);
  } catch (err) {
    const res = handleStudioError(err);
    if (res) return res;
    throw err;
  }
});
