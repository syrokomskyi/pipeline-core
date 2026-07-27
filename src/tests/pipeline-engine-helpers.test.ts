import { describe, it, expect } from "vitest";
import {
  buildSelectedStepIdSet,
  getErrorMessage,
  sanitizeFileSegment,
  classifyArtifactValidationError,
} from "../lib/pipeline-engine-helpers.js";
import { ArtifactValidationError } from "../lib/errors/artifact-validation-error.js";

describe("buildSelectedStepIdSet", () => {
  const steps = [{ id: "a" }, { id: "b" }, { id: "c" }, { id: "d" }];

  it("selects all steps by default", () => {
    const result = buildSelectedStepIdSet({ steps, runOptions: {} });
    expect(result.size).toBe(4);
    expect([...result]).toEqual(["a", "b", "c", "d"]);
  });

  it("selects only specified steps with only option", () => {
    const result = buildSelectedStepIdSet({ steps, runOptions: { only: ["b", "d"] } });
    expect([...result]).toEqual(["b", "d"]);
  });

  it("selects range with from and to", () => {
    const result = buildSelectedStepIdSet({ steps, runOptions: { from: "b", to: "c" } });
    expect([...result]).toEqual(["b", "c"]);
  });

  it("selects from to end with only from", () => {
    const result = buildSelectedStepIdSet({ steps, runOptions: { from: "c" } });
    expect([...result]).toEqual(["c", "d"]);
  });

  it("selects from start to with only to", () => {
    const result = buildSelectedStepIdSet({ steps, runOptions: { to: "b" } });
    expect([...result]).toEqual(["a", "b"]);
  });

  it("throws on unknown step id in only", () => {
    expect(() => buildSelectedStepIdSet({ steps, runOptions: { only: ["unknown"] } })).toThrow(
      "Unknown pipeline step id",
    );
  });

  it("throws on unknown from id", () => {
    expect(() => buildSelectedStepIdSet({ steps, runOptions: { from: "unknown" } })).toThrow(
      "Unknown pipeline step id",
    );
  });

  it("throws when from is after to", () => {
    expect(() => buildSelectedStepIdSet({ steps, runOptions: { from: "d", to: "a" } })).toThrow(
      "Invalid execution range",
    );
  });
});

describe("getErrorMessage", () => {
  it("extracts message from Error", () => {
    expect(getErrorMessage(new Error("test error"))).toBe("test error");
  });

  it("returns string directly", () => {
    expect(getErrorMessage("string error")).toBe("string error");
  });

  it("stringifies other values", () => {
    expect(getErrorMessage(42)).toBe("42");
    expect(getErrorMessage({ a: 1 })).toBe("[object Object]");
  });
});

describe("sanitizeFileSegment", () => {
  it("replaces non-alphanumeric with hyphens", () => {
    expect(sanitizeFileSegment("hello world")).toBe("hello-world");
  });

  it("collapses consecutive hyphens", () => {
    expect(sanitizeFileSegment("a---b")).toBe("a-b");
  });

  it("strips leading and trailing hyphens", () => {
    expect(sanitizeFileSegment("--hello--")).toBe("hello");
  });

  it("handles empty string", () => {
    expect(sanitizeFileSegment("")).toBe("");
  });

  it("preserves alphanumerics and hyphens", () => {
    expect(sanitizeFileSegment("abc-123")).toBe("abc-123");
  });

  it("handles special characters", () => {
    expect(sanitizeFileSegment("a.b/c@d")).toBe("a-b-c-d");
  });
});

describe("classifyArtifactValidationError", () => {
  it("returns error if it is already ArtifactValidationError", async () => {
    const err = new ArtifactValidationError({
      ownerStepId: "s",
      artifactId: "a",
      absolutePath: "/p",
      reason: "r",
    });
    const result = await classifyArtifactValidationError({
      assertAllArtifactsValid: async () => {},
      error: err,
      stepId: "s",
    });
    expect(result).toBe(err);
  });

  it("returns null when assertAllArtifactsValid passes", async () => {
    const result = await classifyArtifactValidationError({
      assertAllArtifactsValid: async () => {},
      error: new Error("some other error"),
      stepId: "s",
    });
    expect(result).toBeNull();
  });

  it("returns ArtifactValidationError when assertAllArtifactsValid throws it", async () => {
    const validationErr = new ArtifactValidationError({
      ownerStepId: "s",
      artifactId: "a",
      absolutePath: "/p",
      reason: "r",
    });
    const result = await classifyArtifactValidationError({
      assertAllArtifactsValid: async () => {
        throw validationErr;
      },
      error: new Error("original"),
      stepId: "s",
    });
    expect(result).toBe(validationErr);
  });

  it("returns null when assertAllArtifactsValid throws non-ArtifactValidationError", async () => {
    const result = await classifyArtifactValidationError({
      assertAllArtifactsValid: async () => {
        throw new Error("other");
      },
      error: new Error("original"),
      stepId: "s",
    });
    expect(result).toBeNull();
  });
});
