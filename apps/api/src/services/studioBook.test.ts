import { MAX_STUDIO_MODEL_CHARS } from "@yudu/shared";
import { describe, expect, it } from "vitest";
import type { Env } from "../env";
import {
  getStudioBookDetail,
  parseStudioAssets,
  patchStudioBook,
  StudioValidationError,
  validateAndNormalizeAssets,
} from "./studioBook";

describe("studioBook assets", () => {
  it("parseStudioAssets 空值返回空模板", () => {
    const a = parseStudioAssets(null);
    expect(a.characters).toEqual([]);
    expect(a.outline).toBe("");
    expect(a.chapterOutlines).toEqual([]);
  });

  it("validateAndNormalizeAssets 重排细纲 index", () => {
    const a = validateAndNormalizeAssets({
      premise: { genre: "都市" },
      characters: [
        { id: "1", name: "甲", role: "主角", description: "成年" },
      ],
      outline: "大纲",
      chapterOutlines: [
        { index: 9, title: "开端", summary: "相遇" },
        { index: 3, title: "发展", summary: "冲突" },
      ],
      updatedAt: 1,
    });
    expect(a.chapterOutlines[0]!.index).toBe(0);
    expect(a.chapterOutlines[1]!.index).toBe(1);
    expect(a.premise.genre).toBe("都市");
    expect(a.updatedAt).toBeGreaterThan(1);
  });

  it("细纲过多抛错", () => {
    const many = Array.from({ length: 501 }, (_, i) => ({
      index: i,
      title: `第${i}章`,
      summary: "x",
    }));
    expect(() =>
      validateAndNormalizeAssets({
        premise: {},
        characters: [],
        outline: "",
        chapterOutlines: many,
        updatedAt: 0,
      }),
    ).toThrow(/细纲/);
  });

  it("立项保留 idea / logline / autoChapterCount", () => {
    const a = validateAndNormalizeAssets({
      premise: {
        idea: "女主穿越成反派他妈",
        genre: "穿书｜古言",
        tone: "轻松搞笑",
        targetLength: "中篇（约 30 万字）",
        logline: "她只想苟活，儿子却要造反",
        notes: "主角必须叫林晚",
        autoChapterCount: false,
      },
      characters: [],
      outline: "",
      chapterOutlines: [],
      updatedAt: 0,
    });
    expect(a.premise.idea).toBe("女主穿越成反派他妈");
    expect(a.premise.genre).toBe("穿书｜古言");
    expect(a.premise.logline).toBe("她只想苟活，儿子却要造反");
    expect(a.premise.autoChapterCount).toBe(false);
  });

  it("autoChapterCount 非布尔时丢弃", () => {
    const a = validateAndNormalizeAssets({
      premise: { autoChapterCount: "yes" as unknown as boolean },
      characters: [],
      outline: "",
      chapterOutlines: [],
      updatedAt: 0,
    });
    expect(a.premise.autoChapterCount).toBeUndefined();
  });

  it("角色卡保留 8 个结构化维度", () => {
    const a = validateAndNormalizeAssets({
      premise: {},
      characters: [
        {
          id: "1",
          name: "林晚",
          role: "主角",
          description: "",
          ageIdentity: "32 岁，侯府主母",
          appearance: "眼尾一道旧痕",
          personality: "外冷内热",
          background: "穿书前是急诊科护士",
          motivation: "只想活到儿子成年",
          flaw: "见血就手抖",
          speech: "话少，爱用短句",
          relations: "与沈篁是母子，互相提防",
        },
      ],
      outline: "",
      chapterOutlines: [],
      updatedAt: 0,
    });
    const c = a.characters[0]!;
    expect(c.ageIdentity).toBe("32 岁，侯府主母");
    expect(c.appearance).toBe("眼尾一道旧痕");
    expect(c.personality).toBe("外冷内热");
    expect(c.background).toBe("穿书前是急诊科护士");
    expect(c.motivation).toBe("只想活到儿子成年");
    expect(c.flaw).toBe("见血就手抖");
    expect(c.speech).toBe("话少，爱用短句");
    expect(c.relations).toBe("与沈篁是母子，互相提防");
  });

  it("角色卡新字段非字符串时丢弃，基础字段仍归一化", () => {
    const a = validateAndNormalizeAssets({
      premise: {},
      characters: [
        {
          id: "1",
          name: "林晚",
          role: "主角",
          description: "旧描述",
          motivation: 123 as unknown as string,
          flaw: null as unknown as string,
        },
      ],
      outline: "",
      chapterOutlines: [],
      updatedAt: 0,
    });
    const c = a.characters[0]!;
    expect(c.name).toBe("林晚");
    expect(c.description).toBe("旧描述");
    expect(c.motivation).toBeUndefined();
    expect(c.flaw).toBeUndefined();
  });

  it("保留结构化大纲 8 字段", () => {
    const a = validateAndNormalizeAssets({
      premise: {},
      characters: [],
      outline: "",
      outlineDetail: {
        throughline: "母亲想保命，儿子要造反",
        setting: "架空王朝，无灵力",
        conflict: "母子目标相反且都不能退",
        act1: "穿书当夜",
        act2: "两次试探",
        act3: "宫变",
        act4: "各自得偿所愿又都失去点什么",
        subplots: "旧护身符伏笔在第 40 章收",
      },
      chapterOutlines: [],
      updatedAt: 0,
    });
    expect(a.outlineDetail?.throughline).toBe("母亲想保命，儿子要造反");
    expect(a.outlineDetail?.act3).toBe("宫变");
    expect(a.outlineDetail?.subplots).toBe("旧护身符伏笔在第 40 章收");
  });

  it("结构化大纲全空时不写入该键", () => {
    const a = validateAndNormalizeAssets({
      premise: {},
      characters: [],
      outline: "旧大纲",
      outlineDetail: { throughline: 1 as unknown as string },
      chapterOutlines: [],
      updatedAt: 0,
    });
    expect(a.outlineDetail).toBeUndefined();
    expect(a.outline).toBe("旧大纲");
  });

  it("细纲保留冲突 / 钩子 / 出场人物，非字符串丢弃", () => {
    const a = validateAndNormalizeAssets({
      premise: {},
      characters: [],
      outline: "",
      chapterOutlines: [
        {
          index: 0,
          title: "雨夜来客",
          summary: "林晚醒来",
          conflict: "被认出不是原主",
          hook: "门外传来第二次敲门",
          characters: 42 as unknown as string,
        },
      ],
      updatedAt: 0,
    });
    const ch = a.chapterOutlines[0]!;
    expect(ch.conflict).toBe("被认出不是原主");
    expect(ch.hook).toBe("门外传来第二次敲门");
    expect(ch.characters).toBeUndefined();
    expect(ch.summary).toBe("林晚醒来");
  });
});

/** 最小 mock D1，仅覆盖 patchStudioBook / getStudioBookDetail 用到的 SQL 分支 */
type BookRow = Record<string, unknown>;

function createStudioEnv(initial: BookRow): { env: Env; book: BookRow } {
  const book: BookRow = {
    format: "txt",
    cover_r2_key: null,
    status: "ready",
    error_message: null,
    chapter_count: 0,
    created_at: 0,
    updated_at: 0,
    group_name: null,
    source: "studio",
    on_shelf: 0,
    break_limit: 0,
    studio_model: null,
    studio_assets: null,
    author: null,
    ...initial,
  };

  function summaryRow(b: BookRow) {
    return {
      id: b.id,
      title: b.title,
      author: b.author ?? null,
      format: b.format,
      cover_r2_key: b.cover_r2_key,
      status: b.status,
      error_message: b.error_message,
      chapter_count: b.chapter_count,
      updated_at: b.updated_at,
      created_at: b.created_at,
      group_name: b.group_name,
      source: b.source,
      on_shelf: b.on_shelf,
      break_limit: b.break_limit,
      chapter_index: null,
      char_offset: null,
      progress_char_count: null,
      last_read_at: null,
    };
  }

  const db = {
    prepare(sql: string) {
      return {
        bind(...args: unknown[]) {
          return {
            async run() {
              if (sql.startsWith("UPDATE books SET title")) {
                const [title, author, breakLimit, studioModel, updatedAt] =
                  args as [string, string | null, number, string | null, number];
                book.title = title;
                book.author = author;
                book.break_limit = breakLimit;
                book.studio_model = studioModel;
                book.updated_at = updatedAt;
                return { success: true, meta: { changes: 1 } };
              }
              throw new Error(`unexpected run sql: ${sql}`);
            },
            async first<T>() {
              if (sql.includes("studio_assets")) return { ...book } as T;
              if (sql.includes("studio_model, source")) return { ...book } as T;
              if (sql.includes("FROM books b")) return summaryRow(book) as T;
              throw new Error(`unexpected first sql: ${sql}`);
            },
            async all<T>() {
              if (sql.includes("FROM chapters")) return { results: [] as T[] };
              throw new Error(`unexpected all sql: ${sql}`);
            },
          };
        },
      };
    },
  };

  const env = {
    DB: db,
    BOOKS_BUCKET: {},
    SESSION_SECRET: "test",
  } as unknown as Env;

  return { env, book };
}

const noProgress = () => null;

describe("studioBook 每本书模型", () => {
  it("patchStudioBook 持久化 model，getStudioBookDetail 回读", async () => {
    const { env, book } = createStudioEnv({
      id: "b1",
      title: "作品",
      user_id: "u1",
    });
    await patchStudioBook(
      env,
      "u1",
      "b1",
      { model: "gemini-2.0-pro" },
      noProgress,
    );
    expect(book.studio_model).toBe("gemini-2.0-pro");

    const detail = await getStudioBookDetail(env, "u1", "b1");
    expect(detail.model).toBe("gemini-2.0-pro");
  });

  it("model 超长抛 StudioValidationError", async () => {
    const { env } = createStudioEnv({ id: "b1", title: "作品", user_id: "u1" });
    await expect(
      patchStudioBook(
        env,
        "u1",
        "b1",
        { model: "x".repeat(MAX_STUDIO_MODEL_CHARS + 1) },
        noProgress,
      ),
    ).rejects.toBeInstanceOf(StudioValidationError);
  });

  it("model=null 清除本书模型", async () => {
    const { env, book } = createStudioEnv({
      id: "b1",
      title: "作品",
      user_id: "u1",
      studio_model: "old-model",
    });
    await patchStudioBook(env, "u1", "b1", { model: null }, noProgress);
    expect(book.studio_model).toBeNull();
  });
});
