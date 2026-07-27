import { describe, it, expect } from "vitest";
import { PipelineStep } from "../lib/pipeline-step.js";
import type { PipelineStepContext } from "../lib/pipeline-types.js";

function makeCtx(overrides: Partial<PipelineStepContext> = {}): PipelineStepContext {
  return {
    state: {},
    currentStepId: null,
    runNamespace: { outputRootDir: "", lockedInputs: {} },
    getPipelineOutputDir: () => "/output",
    getStepNumber: () => 1,
    getStepOutputDir: (id: string) => `/output/${id}`,
    getOutputPath: (id: string, name: string) => `/output/${id}/${name}`,
    getStepArtifactPath: (id: string, art: string) => `/output/${id}/${art}`,
    ensureOutputDir: async () => {},
    fileExists: async () => false,
    assertStepArtifactValid: async () => {},
    logStepEvent: async () => {},
    ...overrides,
  };
}

class TestStep extends PipelineStep {
  readonly id = "test-step";
  async run(): Promise<void> {}
}

describe("PipelineStep", () => {
  it("has default retryPolicy and reusePolicy", () => {
    const step = new TestStep();
    expect(step.retryPolicy).toBe("on_output_invalid");
    expect(step.reusePolicy).toBe("reuse_valid_artifacts");
  });

  it("getArtifactPath delegates to ctx", () => {
    const step = new TestStep();
    const ctx = makeCtx();
    const result = step.getArtifactPath(ctx, "some-artifact");
    expect(result).toBe("/output/test-step/some-artifact");
  });

  it("getPromptFileNames returns id.md by default", () => {
    const step = new TestStep();
    expect(step.getPromptFileNames()).toEqual(["test-step.md"]);
  });

  it("shouldSkip returns false by default", async () => {
    const step = new TestStep();
    const ctx = makeCtx();
    expect(await step.shouldSkip(ctx)).toBe(false);
  });

  it("shouldSkip returns true when id is in skipStepIds", async () => {
    const step = new TestStep();
    step.skipStepIds = ["test-step"];
    const ctx = makeCtx();
    expect(await step.shouldSkip(ctx)).toBe(true);
  });

  it("validateBeforeStart and hydrateFromArtifacts are no-ops", async () => {
    const step = new TestStep();
    const ctx = makeCtx();
    await expect(step.validateBeforeStart(ctx)).resolves.toBeUndefined();
    await expect(step.hydrateFromArtifacts(ctx)).resolves.toBeUndefined();
  });

  it("explainStep returns default seed when no override", () => {
    const step = new TestStep();
    const seed = step.explainStep({} as never);
    expect(seed.title).toBe("test-step");
    expect(seed.purpose).toContain("test-step");
    expect(seed.inputs).toHaveLength(1);
  });

  it("withExplanation sets override and returns this", () => {
    const step = new TestStep();
    const result = step.withExplanation({
      title: "Custom",
      purpose: "Custom purpose",
      inputs: ["a", "b"],
    });
    expect(result).toBe(step);
    const seed = step.explainStep({} as never);
    expect(seed.title).toBe("Custom");
    expect(seed.purpose).toBe("Custom purpose");
    expect(seed.inputs).toEqual(["a", "b"]);
  });

  it("withExplanation accepts a factory function", () => {
    const step = new TestStep();
    step.withExplanation((ctx) => ({
      title: `Step count: ${ctx.steps.length}`,
      purpose: "dynamic",
      inputs: [],
    }));
    const seed = step.explainStep({ steps: [{ id: "a" }] } as never);
    expect(seed.title).toBe("Step count: 1");
  });

  it("getSkipIds returns skipStepIds by default", () => {
    const step = new TestStep();
    expect(step.getSkipIds(makeCtx())).toEqual([]);
    step.skipStepIds = ["a", "b"];
    expect(step.getSkipIds(makeCtx())).toEqual(["a", "b"]);
  });
});
