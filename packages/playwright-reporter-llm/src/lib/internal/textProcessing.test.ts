import { describe, expect, it } from "vitest";

import {
  capConsoleMessageText,
  capNetworkBody,
  capOutput,
  capText,
  extractFirstLine,
  isJsonOrTextContentType,
  stripAnsi,
} from "./textProcessing";

describe(stripAnsi, () => {
  it("removes ANSI escape codes from text", () => {
    const ansiRed = `\u001B[31mred text\u001B[39m`; // cspell:disable-line

    expect(stripAnsi(ansiRed)).toBe("red text");
  });

  it("returns plain text unchanged", () => {
    expect(stripAnsi("plain text")).toBe("plain text");
  });
});

describe(capText, () => {
  it("returns text unchanged when within limit", () => {
    expect(capText("short", 100)).toBe("short");
  });

  it("truncates and appends marker when exceeding limit", () => {
    const result = capText("x".repeat(200), 100);

    expect(result).toHaveLength(100);
    expect(result).toContain("[truncated]");
  });
});

describe(capOutput, () => {
  it("returns text unchanged when within 4KB", () => {
    expect(capOutput("short")).toBe("short");
  });

  it("truncates at 4KB", () => {
    const result = capOutput("x".repeat(5000));

    expect(result).toHaveLength(4096);
    expect(result).toContain("[truncated]");
  });
});

describe(capNetworkBody, () => {
  it("truncates at 2KB", () => {
    const result = capNetworkBody("x".repeat(5000));

    expect(result).toHaveLength(2048);
    expect(result).toContain("[truncated]");
  });
});

describe(capConsoleMessageText, () => {
  it("truncates at 2KB", () => {
    const result = capConsoleMessageText("x".repeat(5000));

    expect(result).toHaveLength(2048);
    expect(result).toContain("[truncated]");
  });
});

describe(isJsonOrTextContentType, () => {
  it("returns true for JSON content types", () => {
    expect(isJsonOrTextContentType("application/json")).toBe(true);
  });

  it("returns true for text content types", () => {
    expect(isJsonOrTextContentType("text/plain")).toBe(true);
    expect(isJsonOrTextContentType("text/html; charset=utf-8")).toBe(true);
  });

  it("returns false for binary content types", () => {
    expect(isJsonOrTextContentType("application/octet-stream")).toBe(false);
  });

  it("returns false for undefined", () => {
    const input: string | undefined = undefined;

    expect(isJsonOrTextContentType(input)).toBe(false);
  });

  it("returns false for empty content type after splitting", () => {
    expect(isJsonOrTextContentType("; charset=utf-8")).toBe(false);
  });
});

describe(extractFirstLine, () => {
  it("extracts the first line from multiline text", () => {
    expect(extractFirstLine("first\nsecond\nthird")).toBe("first");
  });

  it("strips ANSI from the first line", () => {
    const ansiInput = `\u001B[31mcolored\u001B[39m\nrest`; // cspell:disable-line

    expect(extractFirstLine(ansiInput)).toBe("colored");
  });

  it("returns undefined for undefined input", () => {
    const input: string | undefined = undefined;

    expect(extractFirstLine(input)).toBeUndefined();
  });

  it("returns undefined when first line is blank", () => {
    expect(extractFirstLine("   \nsecond line")).toBeUndefined();
  });
});
