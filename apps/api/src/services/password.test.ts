import { describe, it, expect } from "vitest";
import { hashPassword, verifyPassword } from "./password";

describe("password", () => {
  it("哈希后能校验正确密码", async () => {
    const hash = await hashPassword("正确密码123");
    expect(hash).not.toContain("正确密码123");
    expect(await verifyPassword("正确密码123", hash)).toBe(true);
    expect(await verifyPassword("错误", hash)).toBe(false);
  });
});
