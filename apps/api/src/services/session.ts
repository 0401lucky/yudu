import { SESSION_DAYS } from "@yudu/shared";

const TOKEN_BYTES = 32;

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]!);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** HMAC-SHA256(token, secret) → hex */
export async function hashToken(token: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(token),
  );
  return bytesToHex(new Uint8Array(sig));
}

export async function createSession(
  db: D1Database,
  userId: string,
  secret: string,
): Promise<{ id: string; token: string; expiresAt: number }> {
  const id = crypto.randomUUID();
  const token = bytesToBase64Url(crypto.getRandomValues(new Uint8Array(TOKEN_BYTES)));
  const tokenHash = await hashToken(token, secret);
  const now = Date.now();
  const expiresAt = now + SESSION_DAYS * 24 * 60 * 60 * 1000;

  await db
    .prepare(
      `INSERT INTO sessions (id, user_id, token_hash, expires_at, created_at)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .bind(id, userId, tokenHash, expiresAt, now)
    .run();

  return { id, token, expiresAt };
}

export async function deleteSession(
  db: D1Database,
  sessionId: string,
): Promise<void> {
  await db.prepare(`DELETE FROM sessions WHERE id = ?`).bind(sessionId).run();
}

/** 用 Cookie 中的原始 token 解析未过期会话 */
export async function resolveSession(
  db: D1Database,
  token: string,
  secret: string,
): Promise<{ id: string; userId: string } | null> {
  const tokenHash = await hashToken(token, secret);
  const now = Date.now();
  const row = await db
    .prepare(
      `SELECT id, user_id FROM sessions WHERE token_hash = ? AND expires_at > ?`,
    )
    .bind(tokenHash, now)
    .first<{ id: string; user_id: string }>();

  if (!row) return null;
  return { id: row.id, userId: row.user_id };
}
