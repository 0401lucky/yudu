import { Hono } from "hono";
import type {
  HighlightColor,
  HighlightWithChapter,
  NotesBookGroup,
} from "@yudu/shared";
import type { Env } from "../env";
import { authMiddleware, type AuthVariables } from "../middleware/auth";

type NoteRow = {
  id: string;
  book_id: string;
  chapter_index: number;
  start_offset: number;
  end_offset: number;
  color: string;
  excerpt: string;
  note: string | null;
  created_at: number;
  book_title: string;
  book_author: string | null;
  chapter_title: string | null;
};

export const notesRoutes = new Hono<{
  Bindings: Env;
  Variables: AuthVariables;
}>();

notesRoutes.use("*", authMiddleware);

function rowToHighlight(row: NoteRow): HighlightWithChapter {
  return {
    id: row.id,
    chapterIndex: row.chapter_index,
    startOffset: row.start_offset,
    endOffset: row.end_offset,
    color: row.color as HighlightColor,
    excerpt: row.excerpt,
    note: row.note,
    createdAt: row.created_at,
    // chapters 缺失（异常数据）时兜底「第 N 章」
    chapterTitle:
      row.chapter_title?.trim() || `第 ${row.chapter_index + 1} 章`,
  };
}

/** GET /api/notes — 当前用户全部高亮（joined 书名与章节标题），按书分组 */
notesRoutes.get("/", async (c) => {
  const userId = c.get("userId");

  const { results } = await c.env.DB.prepare(
    `SELECT h.id, h.book_id, h.chapter_index, h.start_offset, h.end_offset,
            h.color, h.excerpt, h.note, h.created_at,
            b.title AS book_title, b.author AS book_author,
            c.title AS chapter_title
     FROM highlights h
     JOIN books b ON b.id = h.book_id AND b.user_id = h.user_id
     LEFT JOIN chapters c ON c.book_id = h.book_id AND c.idx = h.chapter_index
     WHERE h.user_id = ?
     ORDER BY b.title ASC, h.chapter_index ASC, h.start_offset ASC`,
  )
    .bind(userId)
    .all<NoteRow>();

  // JS 侧按 bookId 分组（Map 保持首见顺序，即书名字典序）
  const groups = new Map<string, NotesBookGroup>();
  for (const row of results ?? []) {
    let group = groups.get(row.book_id);
    if (!group) {
      group = {
        bookId: row.book_id,
        bookTitle: row.book_title,
        bookAuthor: row.book_author,
        highlights: [],
      };
      groups.set(row.book_id, group);
    }
    group.highlights.push(rowToHighlight(row));
  }

  return c.json([...groups.values()]);
});
