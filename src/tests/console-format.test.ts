import { describe, it, expect } from "vitest";
import {
  toRelativePath,
  stripAnsi,
  formatPipelineStart,
  formatPipelineFinished,
  formatDryRunSummary,
  formatForceSummary,
  formatSkippedStep,
  formatPipelineError,
  formatPipelineOverview,
} from "../lib/console-format.js";

describe("toRelativePath", () => {
  it("returns a relative path from git root", () => {
    const result = toRelativePath(process.cwd() + "/src/file.ts");
    expect(result).not.toContain(":");
    expect(result).toMatch(/src\/file\.ts$/);
  });

  it("returns relative path from git root for cwd", () => {
    const result = toRelativePath(process.cwd());
    // cwd is packages/pipeline/pipeline-core relative to the git root
    expect(result).toMatch(/packages\/pipeline\/pipeline-core/);
  });

  it("normalizes backslashes to forward slashes", () => {
    // On Windows, path.relative may produce backslashes
    const result = toRelativePath(process.cwd() + "\\src\\file.ts");
    expect(result).not.toContain("\\");
  });
});

describe("stripAnsi", () => {
  it("removes ANSI escape codes", () => {
    const input = "\u001B[31mred text\u001B[0m";
    expect(stripAnsi(input)).toBe("red text");
  });

  it("handles strings without ANSI codes", () => {
    expect(stripAnsi("hello world")).toBe("hello world");
  });

  it("removes multiple ANSI codes", () => {
    const input = "\u001B[1m\u001B[31mbold red\u001B[0m\u001B[0m";
    expect(stripAnsi(input)).toBe("bold red");
  });
});

describe("formatPipelineStart", () => {
  it("includes title and dirs", () => {
    const result = formatPipelineStart({
      pipelineTitle: "Test Pipeline",
      inputDir: process.cwd(),
      outputDir: process.cwd(),
    });
    expect(result).toContain("Test Pipeline");
    expect(result).toContain("Run started");
  });

  it("uses default title when not provided", () => {
    const result = formatPipelineStart({});
    expect(result).toContain("Processing started");
  });
});

describe("formatPipelineFinished", () => {
  it("includes title and output dir", () => {
    const result = formatPipelineFinished({
      pipelineTitle: "Done Pipeline",
      outputDir: process.cwd(),
    });
    expect(result).toContain("Done Pipeline");
    expect(result).toContain("Run finished");
  });

  it("uses default title when not provided", () => {
    const result = formatPipelineFinished({});
    expect(result).toContain("Processing complete");
  });
});

describe("formatDryRunSummary", () => {
  it("lists selected steps", () => {
    const result = formatDryRunSummary([
      { stepId: "step-a", outputDir: process.cwd() },
      { stepId: "step-b", outputDir: process.cwd() },
    ]);
    expect(result).toContain("step-a");
    expect(result).toContain("step-b");
    expect(result).toContain("Dry run");
  });

  it("handles empty list", () => {
    const result = formatDryRunSummary([]);
    expect(result).toContain("Dry run");
  });
});

describe("formatForceSummary", () => {
  it("lists forced step ids", () => {
    const result = formatForceSummary(["a", "b", "c"]);
    expect(result).toContain("a, b, c");
    expect(result).toContain("Forced steps");
  });
});

describe("formatSkippedStep", () => {
  it("includes step id and reason", () => {
    const result = formatSkippedStep("step-x", "not needed");
    expect(result).toContain("step-x");
    expect(result).toContain("not needed");
  });
});

describe("formatPipelineError", () => {
  it("formats Error objects", () => {
    const result = formatPipelineError(new Error("something broke"));
    expect(result).toContain("something broke");
    expect(result).toContain("Pipeline failed");
  });

  it("formats non-Error values", () => {
    const result = formatPipelineError("string error");
    expect(result).toContain("string error");
  });
});

describe("formatPipelineOverview", () => {
  it("includes guide title and summary", () => {
    const result = formatPipelineOverview({
      title: "My Pipeline",
      summary: "Does things",
      phases: [],
    });
    expect(result).toContain("My Pipeline");
    expect(result).toContain("Does things");
  });
});
