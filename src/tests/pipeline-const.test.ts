import { describe, it, expect } from "vitest";
import { DEFAULT_EMPTY_USER_PROMPT } from "../lib/pipeline-const.js";

describe("DEFAULT_EMPTY_USER_PROMPT", () => {
  it("is a non-empty string", () => {
    expect(typeof DEFAULT_EMPTY_USER_PROMPT).toBe("string");
    expect(DEFAULT_EMPTY_USER_PROMPT.length).toBeGreaterThan(0);
  });

  it("instructs to follow system instructions", () => {
    expect(DEFAULT_EMPTY_USER_PROMPT).toContain("system instructions");
    expect(DEFAULT_EMPTY_USER_PROMPT).toContain("format");
  });
});
