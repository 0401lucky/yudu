import { describe, it, expect } from "vitest";
import {
  AiKeyCryptoError,
  decryptApiKey,
  encryptApiKey,
  maskApiKey,
} from "./aiKeyCrypto";

const SECRET = "test-master-secret-0123456789";

describe("aiKeyCrypto 加解密", () => {
  it("往返还原明文，且密文不含明文", async () => {
    const key = "sk-abcdef0123456789";
    const stored = await encryptApiKey(key, SECRET);

    expect(stored).not.toContain(key);
    expect(stored.startsWith("v1.")).toBe(true);
    expect(await decryptApiKey(stored, SECRET)).toBe(key);
  });

  it("覆盖空串 / 超长串 / 非 ASCII", async () => {
    const cases = ["", "k".repeat(500), "密钥-🔑-ключ"];
    for (const key of cases) {
      expect(await decryptApiKey(await encryptApiKey(key, SECRET), SECRET)).toBe(
        key,
      );
    }
  });

  it("同一密钥两次加密结果不同（IV 随机），但都能解回", async () => {
    const key = "sk-same-key";
    const a = await encryptApiKey(key, SECRET);
    const b = await encryptApiKey(key, SECRET);

    expect(a).not.toBe(b);
    expect(await decryptApiKey(a, SECRET)).toBe(key);
    expect(await decryptApiKey(b, SECRET)).toBe(key);
  });

  it("换主密钥解不开", async () => {
    const stored = await encryptApiKey("sk-x", SECRET);
    await expect(decryptApiKey(stored, "另一个主密钥")).rejects.toMatchObject({
      code: "AI_KEY_DECRYPT_FAILED",
    });
  });

  it("格式非法时报 AI_KEY_FORMAT", async () => {
    for (const bad of ["", "纯文本", "v2.aaa.bbb", "v1.只有两段"]) {
      await expect(decryptApiKey(bad, SECRET)).rejects.toBeInstanceOf(
        AiKeyCryptoError,
      );
    }
    await expect(decryptApiKey("v2.aaa.bbb", SECRET)).rejects.toMatchObject({
      code: "AI_KEY_FORMAT",
    });
  });

  it("主密钥缺失时 fail fast，不降级明文", async () => {
    await expect(encryptApiKey("sk-x", "")).rejects.toMatchObject({
      code: "AI_KEY_SECRET_MISSING",
    });
    await expect(decryptApiKey("v1.aaa.bbb", "")).rejects.toMatchObject({
      code: "AI_KEY_SECRET_MISSING",
    });
  });
});

describe("maskApiKey", () => {
  it("按前 3 后 4 掩码，过短整体隐藏", () => {
    expect(maskApiKey("sk-abcdef0123")).toBe("sk-…0123");
    expect(maskApiKey("")).toBe("");
    expect(maskApiKey("   ")).toBe("");
    expect(maskApiKey("12345678")).toBe("…");
    expect(maskApiKey("123456789")).toBe("123…6789");
  });
});
