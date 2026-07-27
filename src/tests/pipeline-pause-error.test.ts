import { describe, it, expect } from "vitest";
import { PipelinePauseError } from "../lib/errors/pipeline-pause-error.js";

describe("PipelinePauseError", () => {
  it("extends Error", () => {
    const err = new PipelinePauseError("pause reason");
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe("PipelinePauseError");
    expect(err.message).toBe("pause reason");
  });

  it("supports empty message", () => {
    const err = new PipelinePauseError();
    expect(err.message).toBe("");
  });

  it("supports multi-line message", () => {
    const err = new PipelinePauseError("line1\nline2\nline3");
    expect(err.message.split("\n")).toEqual(["line1", "line2", "line3"]);
  });
});
