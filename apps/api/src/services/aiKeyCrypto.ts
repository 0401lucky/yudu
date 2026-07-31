/**
 * AI 提供商密钥的加解密。**服务端唯一接触明文密钥的模块。**
 *
 * 主密钥来自 Worker Secret `AI_KEY_SECRET`（`wrangler secret put`），与 `SESSION_SECRET` 同构。
 * 存储格式 `v1.<iv>.<密文>`（均为 base64url）：版本前缀是为将来换算法留的解析锚点，
 * 当前只在解密时校验，不实现轮换。
 *
 * 这里自带 base64url 编解码而非复用 `session.ts` 的同名 helper：那边是只有编码的
 * private 函数，此处需要成对的编解码，就地成对实现更内聚，也不必改动稳定的会话模块。
 */

const FORMAT_PREFIX = "v1";
/** AES-GCM 推荐 96 位 IV */
const IV_BYTES = 12;

/** 可预期的加解密失败；由路由捕获后映射成带 code 的错误响应 */
export class AiKeyCryptoError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "AiKeyCryptoError";
    this.code = code;
  }
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]!);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlToBytes(text: string): Uint8Array {
  const base64 = text.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/** SHA-256(主密钥) 作为 AES-256 密钥材料；主密钥本身是高熵随机串，无需再加盐迭代 */
async function deriveKey(secret: string): Promise<CryptoKey> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(secret),
  );
  return crypto.subtle.importKey("raw", digest, { name: "AES-GCM" }, false, [
    "encrypt",
    "decrypt",
  ]);
}

function requireSecret(secret: string): void {
  if (!secret) {
    throw new AiKeyCryptoError(
      "AI_KEY_SECRET_MISSING",
      "服务端未配置密钥加密主密钥，请联系管理员",
    );
  }
}

/** 加密明文密钥；每次调用生成新的随机 IV，同一密钥两次加密结果不同 */
export async function encryptApiKey(
  plain: string,
  secret: string,
): Promise<string> {
  requireSecret(secret);
  const key = await deriveKey(secret);
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const cipher = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    new TextEncoder().encode(plain),
  );
  return [
    FORMAT_PREFIX,
    bytesToBase64Url(iv),
    bytesToBase64Url(new Uint8Array(cipher)),
  ].join(".");
}

/** 解密回明文；格式不符或主密钥不匹配都抛 `AiKeyCryptoError` */
export async function decryptApiKey(
  stored: string,
  secret: string,
): Promise<string> {
  requireSecret(secret);
  const parts = stored.split(".");
  if (parts.length !== 3 || parts[0] !== FORMAT_PREFIX) {
    throw new AiKeyCryptoError("AI_KEY_FORMAT", "密钥密文格式无法识别");
  }

  const key = await deriveKey(secret);
  try {
    const plain = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: base64UrlToBytes(parts[1]!) },
      key,
      base64UrlToBytes(parts[2]!),
    );
    return new TextDecoder().decode(plain);
  } catch {
    // 主密钥变更、密文被篡改、IV 损坏都会落到这里；不区分原因以免泄露细节
    throw new AiKeyCryptoError("AI_KEY_DECRYPT_FAILED", "密钥解密失败");
  }
}

/**
 * 生成给前端展示的掩码，如 `sk-…a1b2`。
 * 过短的密钥整体隐藏，避免掩码本身就把密钥说完了。
 */
export function maskApiKey(plain: string): string {
  const key = plain.trim();
  if (!key) return "";
  if (key.length <= 8) return "…";
  return `${key.slice(0, 3)}…${key.slice(-4)}`;
}
