import { describe, expect, test } from "vitest";
import { truncateMiddle } from "../src/truncate.js";

describe("truncateMiddle", () => {
  test("returns empty string when text is empty", () => {
    expect(truncateMiddle("")).toBe("");
  });

  test("returns the original string when length is strictly within maxLength", () => {
    const text = "Short assistant response.";
    expect(truncateMiddle(text, 256)).toBe(text);
  });

  test("returns the original string when length is exactly maxLength", () => {
    const text = "a".repeat(256);
    expect(truncateMiddle(text, 256)).toBe(text);
  });

  test("truncates middle and preserves head and tail when length exceeds 256", () => {
    const text = "a".repeat(257);
    const result = truncateMiddle(text, 256);

    expect(Array.from(result).length).toBe(256);
    expect(result).toBe(`${"a".repeat(127)}...${"a".repeat(126)}`);
  });

  test("truncates long text while preserving expected head and tail content", () => {
    const head = "Investigation findings: ";
    const middle = "x".repeat(500);
    const tail = " Remaining tasks: A and B.";
    const text = `${head}${middle}${tail}`;

    const result = truncateMiddle(text, 256);

    expect(Array.from(result).length).toBe(256);
    expect(result.startsWith(head)).toBe(true);
    expect(result.endsWith(tail)).toBe(true);
    expect(result).toContain("...");
  });

  test("handles short custom maxLength correctly", () => {
    expect(truncateMiddle("1234567890", 7, "...")).toBe("12...90");
    expect(truncateMiddle("1234567890", 6, "...")).toBe("12...0");
    expect(truncateMiddle("1234567890", 5, "...")).toBe("1...0");
  });

  test("handles edge cases where maxLength is smaller than or equal to ellipsis length", () => {
    expect(truncateMiddle("hello world", 3, "...")).toBe("...");
    expect(truncateMiddle("hello world", 2, "...")).toBe("..");
    expect(truncateMiddle("hello world", 0, "...")).toBe("");
    expect(truncateMiddle("hello world", -1, "...")).toBe("");
  });

  test("preserves surrogate pairs without corrupting emojis", () => {
    const emojis = "🍎🍌🍒🍇🍊🍉🍓🍈🍍🍑";
    const result = truncateMiddle(emojis, 7, "...");

    expect(Array.from(result).length).toBe(7);
    expect(result).toBe("🍎🍌...🍍🍑");
  });
});
