import { describe, expect, it } from "vitest";
import { normalizeAiBaseUrl, parseModelsResponse } from "./aiClient";

describe("normalizeAiBaseUrl", () => {
  it("去掉尾斜杠与末尾 /v1", () => {
    expect(normalizeAiBaseUrl("https://api.example.com/")).toBe(
      "https://api.example.com",
    );
    expect(normalizeAiBaseUrl("https://api.example.com/v1")).toBe(
      "https://api.example.com",
    );
    expect(normalizeAiBaseUrl("https://api.example.com/v1/")).toBe(
      "https://api.example.com",
    );
  });
});

describe("parseModelsResponse", () => {
  it("解析 OpenAI data 数组", () => {
    const ids = parseModelsResponse({
      data: [{ id: "gpt-4o" }, { id: "claude-3" }, { id: "gpt-4o" }],
    });
    expect(ids).toEqual(["claude-3", "gpt-4o"]);
  });

  it("解析 models 字段与纯数组", () => {
    expect(parseModelsResponse({ models: ["b", "a"] })).toEqual(["a", "b"]);
    expect(parseModelsResponse(["z", "y"])).toEqual(["y", "z"]);
  });

  it("非法结构返回空", () => {
    expect(parseModelsResponse(null)).toEqual([]);
    expect(parseModelsResponse({ foo: 1 })).toEqual([]);
  });
});
