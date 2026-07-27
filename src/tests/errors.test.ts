import { describe, it, expect } from "vitest";
import { ArtifactValidationError } from "../lib/errors/artifact-validation-error.js";

describe("ArtifactValidationError", () => {
  it("constructs with all fields", () => {
    const err = new ArtifactValidationError({
      ownerStepId: "step-a",
      artifactId: "output.md",
      absolutePath: "/tmp/step-a/output.md",
      reason: "file not found",
    });
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe("ArtifactValidationError");
    expect(err.ownerStepId).toBe("step-a");
    expect(err.artifactId).toBe("output.md");
    expect(err.absolutePath).toBe("/tmp/step-a/output.md");
    expect(err.displayPath).toBe("/tmp/step-a/output.md");
    expect(err.reason).toBe("file not found");
    expect(err.message).toContain("step-a:output.md");
    expect(err.message).toContain("file not found");
  });

  it("uses displayPath when provided", () => {
    const err = new ArtifactValidationError({
      ownerStepId: "step-b",
      artifactId: "data.json",
      absolutePath: "/abs/path/data.json",
      displayPath: "packages/x/data.json",
      reason: "invalid JSON",
    });
    expect(err.displayPath).toBe("packages/x/data.json");
    expect(err.message).toContain("packages/x/data.json");
  });

  it("message includes all three lines", () => {
    const err = new ArtifactValidationError({
      ownerStepId: "s",
      artifactId: "a",
      absolutePath: "/p",
      reason: "r",
    });
    const lines = err.message.split("\n");
    expect(lines).toHaveLength(3);
    expect(lines[0]).toContain("s:a");
    expect(lines[1]).toContain("/p");
    expect(lines[2]).toContain("r");
  });
});
