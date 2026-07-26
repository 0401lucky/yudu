// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { offsetsToRange, rangeToOffsets } from "./textAnchor";

/** 构造 plain 结构：单个文本节点 */
function plainContainer(text: string): HTMLElement {
  const div = document.createElement("div");
  div.textContent = text;
  return div;
}

/**
 * 构造嵌套结构（模拟 markdown 渲染 DOM）：
 * <div><p>春眠<strong>不觉</strong>晓</p><p>处处闻啼鸟</p></div>
 * 渲染纯文本 = "春眠不觉晓处处闻啼鸟"（偏移 0–10）
 */
function nestedContainer(): HTMLElement {
  const div = document.createElement("div");
  div.innerHTML = "<p>春眠<strong>不觉</strong>晓</p><p>处处闻啼鸟</p>";
  return div;
}

describe("rangeToOffsets", () => {
  it("plain：单文本节点内的选区映射为字符区间", () => {
    const el = plainContainer("床前明月光，疑是地上霜。");
    const textNode = el.firstChild as Text;
    const range = document.createRange();
    range.setStart(textNode, 2);
    range.setEnd(textNode, 5);
    expect(rangeToOffsets(el, range)).toEqual({ start: 2, end: 5 });
  });

  it("嵌套：跨元素选区按渲染文本序累计偏移", () => {
    const el = nestedContainer();
    const strongText = el.querySelector("strong")!.firstChild as Text; // "不觉"
    const p2Text = el.querySelectorAll("p")[1]!.firstChild as Text; // "处处闻啼鸟"
    const range = document.createRange();
    range.setStart(strongText, 1); // 全文偏移 3（"春眠不" 之后）
    range.setEnd(p2Text, 2); // 全文偏移 7（"处处" 之后）
    expect(rangeToOffsets(el, range)).toEqual({ start: 3, end: 7 });
  });

  it("嵌套：端点落在元素节点（如三击选段）也能换算", () => {
    const el = nestedContainer();
    const p1 = el.querySelectorAll("p")[0]!;
    const range = document.createRange();
    // 选中第一段整段：<p> 元素边界 [0, childNodes.length)
    range.setStart(p1, 0);
    range.setEnd(p1, p1.childNodes.length);
    expect(rangeToOffsets(el, range)).toEqual({ start: 0, end: 5 });
  });

  it("折叠选区与容器外端点返回 null", () => {
    const el = plainContainer("你好");
    const textNode = el.firstChild as Text;
    const collapsed = document.createRange();
    collapsed.setStart(textNode, 1);
    collapsed.setEnd(textNode, 1);
    expect(rangeToOffsets(el, collapsed)).toBeNull();

    const outside = document.createElement("div");
    outside.textContent = "别处";
    const foreign = document.createRange();
    foreign.setStart(outside.firstChild as Text, 0);
    foreign.setEnd(outside.firstChild as Text, 1);
    expect(rangeToOffsets(el, foreign)).toBeNull();
  });
});

describe("offsetsToRange", () => {
  it("plain：偏移区间还原为文本节点内 Range", () => {
    const el = plainContainer("举头望明月，低头思故乡。");
    const range = offsetsToRange(el, 2, 5);
    expect(range).not.toBeNull();
    expect(range!.toString()).toBe("望明月");
  });

  it("嵌套：跨元素区间还原后文本一致", () => {
    const el = nestedContainer();
    const range = offsetsToRange(el, 3, 7);
    expect(range).not.toBeNull();
    expect(range!.toString()).toBe("觉晓处处");
  });

  it("终点恰在文本末尾时可还原", () => {
    const el = nestedContainer();
    const range = offsetsToRange(el, 5, 10);
    expect(range).not.toBeNull();
    expect(range!.toString()).toBe("处处闻啼鸟");
  });

  it("越界或非法区间返回 null", () => {
    const el = plainContainer("你好");
    expect(offsetsToRange(el, 0, 3)).toBeNull(); // end 越界
    expect(offsetsToRange(el, 2, 2)).toBeNull(); // 折叠
    expect(offsetsToRange(el, -1, 1)).toBeNull(); // 负偏移
    expect(offsetsToRange(document.createElement("div"), 0, 1)).toBeNull(); // 空容器
  });

  it("与 rangeToOffsets 往返一致", () => {
    const el = nestedContainer();
    const range = offsetsToRange(el, 1, 9)!;
    expect(rangeToOffsets(el, range)).toEqual({ start: 1, end: 9 });
  });
});
