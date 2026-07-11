import { describe, it, expect, beforeEach } from "vitest";
import {
  createSession,
  deleteSession,
  hashToken,
  resolveSession,
} from "./session";

type SessionRow = {
  id: string;
  user_id: string;
  token_hash: string;
  expires_at: number;
  created_at: number;
};

function createMockDb() {
  const sessions = new Map<string, SessionRow>();

  const db = {
    prepare(sql: string) {
      return {
        bind(...args: unknown[]) {
          return {
            async run() {
              if (sql.includes("INSERT INTO sessions")) {
                const row: SessionRow = {
                  id: args[0] as string,
                  user_id: args[1] as string,
                  token_hash: args[2] as string,
                  expires_at: args[3] as number,
                  created_at: args[4] as number,
                };
                sessions.set(row.id, row);
                return { success: true };
              }
              if (sql.includes("DELETE FROM sessions")) {
                sessions.delete(args[0] as string);
                return { success: true };
              }
              throw new Error(`unexpected run sql: ${sql}`);
            },
            async first<T>() {
              if (sql.includes("FROM sessions") && sql.includes("token_hash")) {
                const tokenHash = args[0] as string;
                const now = args[1] as number;
                for (const row of sessions.values()) {
                  if (row.token_hash === tokenHash && row.expires_at > now) {
                    return {
                      id: row.id,
                      user_id: row.user_id,
                    } as T;
                  }
                }
                return null;
              }
              throw new Error(`unexpected first sql: ${sql}`);
            },
          };
        },
      };
    },
    _sessions: sessions,
  };

  return db as unknown as D1Database & { _sessions: Map<string, SessionRow> };
}

describe("session", () => {
  const secret = "test-session-secret";
  let db: ReturnType<typeof createMockDb>;

  beforeEach(() => {
    db = createMockDb();
  });

  it("hashToken 对同一输入稳定且非明文", async () => {
    const a = await hashToken("token-abc", secret);
    const b = await hashToken("token-abc", secret);
    expect(a).toBe(b);
    expect(a).not.toContain("token-abc");
    expect(a.length).toBeGreaterThan(16);
  });

  it("createSession 写入哈希而非原始 token，并能 resolve", async () => {
    const session = await createSession(db, "user-1", secret);
    expect(session.id).toBeTruthy();
    expect(session.token).toBeTruthy();
    expect(session.expiresAt).toBeGreaterThan(Date.now());

    const stored = db._sessions.get(session.id);
    expect(stored).toBeDefined();
    expect(stored!.user_id).toBe("user-1");
    expect(stored!.token_hash).not.toBe(session.token);
    expect(stored!.token_hash).toBe(await hashToken(session.token, secret));

    const resolved = await resolveSession(db, session.token, secret);
    expect(resolved).toEqual({ id: session.id, userId: "user-1" });
  });

  it("deleteSession 后无法 resolve", async () => {
    const session = await createSession(db, "user-2", secret);
    await deleteSession(db, session.id);
    expect(db._sessions.has(session.id)).toBe(false);
    expect(await resolveSession(db, session.token, secret)).toBeNull();
  });

  it("过期会话无法 resolve", async () => {
    const session = await createSession(db, "user-3", secret);
    const row = db._sessions.get(session.id)!;
    row.expires_at = Date.now() - 1;
    expect(await resolveSession(db, session.token, secret)).toBeNull();
  });
});
