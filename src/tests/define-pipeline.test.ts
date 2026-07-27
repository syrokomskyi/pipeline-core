import { describe, it, expect } from "vitest";
import { definePipeline } from "../lib/define-pipeline.js";
import { PipelinePhase } from "../lib/pipeline-phase.js";
import type { PipelineStepLike } from "../lib/pipeline-types.js";

function makeStep(id: string): PipelineStepLike {
  return {
    id,
    artifacts: {},
    retryPolicy: "none",
    reusePolicy: "always_run",
    run: async () => {},
  };
}

describe("definePipeline", () => {
  it("flattens steps from phases", () => {
    const s1 = makeStep("s1");
    const s2 = makeStep("s2");
    const phase = new PipelinePhase({
      id: "p1",
      members: [s1, s2],
      explain: { title: "P1", purpose: "p" },
    });
    const def = definePipeline({
      title: "Test",
      summary: "test pipeline",
      phases: [phase],
    });
    expect(def.steps.map((s) => s.id)).toEqual(["s1", "s2"]);
  });

  it("preserves title and summary", () => {
    const def = definePipeline({
      title: "My Pipeline",
      summary: "Does stuff",
      phases: [],
    });
    expect(def.title).toBe("My Pipeline");
    expect(def.summary).toBe("Does stuff");
  });

  it("preserves quickStart and operatingRules", () => {
    const def = definePipeline({
      title: "T",
      summary: "S",
      quickStart: ["step1", "step2"],
      operatingRules: ["rule1"],
      phases: [],
    });
    expect(def.quickStart).toEqual(["step1", "step2"]);
    expect(def.operatingRules).toEqual(["rule1"]);
  });

  it("handles nested phases", () => {
    const s1 = makeStep("s1");
    const s2 = makeStep("s2");
    const inner = new PipelinePhase({
      id: "inner",
      members: [s2],
      explain: { title: "Inner", purpose: "i" },
    });
    const outer = new PipelinePhase({
      id: "outer",
      members: [s1, inner],
      explain: { title: "Outer", purpose: "o" },
    });
    const def = definePipeline({
      title: "T",
      summary: "S",
      phases: [outer],
    });
    expect(def.steps.map((s) => s.id)).toEqual(["s1", "s2"]);
  });
});
