import { describe, it, expect } from "vitest";
import { PipelinePhase, Phase } from "../lib/pipeline-phase.js";
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

describe("PipelinePhase", () => {
  it("getSteps returns direct step members", () => {
    const s1 = makeStep("s1");
    const s2 = makeStep("s2");
    const phase = new PipelinePhase({
      id: "p1",
      members: [s1, s2],
      explain: { title: "Phase 1", purpose: "test" },
    });
    expect(phase.getSteps().map((s) => s.id)).toEqual(["s1", "s2"]);
  });

  it("getSteps flattens nested phases", () => {
    const s1 = makeStep("s1");
    const s2 = makeStep("s2");
    const s3 = makeStep("s3");
    const inner = new PipelinePhase({
      id: "inner",
      members: [s2, s3],
      explain: { title: "Inner", purpose: "inner" },
    });
    const outer = new PipelinePhase({
      id: "outer",
      members: [s1, inner],
      explain: { title: "Outer", purpose: "outer" },
    });
    expect(outer.getSteps().map((s) => s.id)).toEqual(["s1", "s2", "s3"]);
  });

  it("getPhases returns self and all nested phases", () => {
    const inner = new PipelinePhase({
      id: "inner",
      members: [makeStep("s1")],
      explain: { title: "Inner", purpose: "inner" },
    });
    const outer = new PipelinePhase({
      id: "outer",
      members: [inner],
      explain: { title: "Outer", purpose: "outer" },
    });
    const phases = outer.getPhases();
    expect(phases.map((p) => p.id)).toEqual(["outer", "inner"]);
  });

  it("explainPhase returns seed when not a function", () => {
    const seed = { title: "T", purpose: "P" };
    const phase = new PipelinePhase({
      id: "p",
      members: [],
      explain: seed,
    });
    const result = phase.explainPhase({} as never);
    expect(result).toBe(seed);
  });

  it("explainPhase calls factory when function", () => {
    const phase = new PipelinePhase({
      id: "p",
      members: [],
      explain: (ctx) => ({
        title: "Dynamic",
        purpose: `Steps: ${ctx.steps.length}`,
      }),
    });
    const result = phase.explainPhase({
      steps: [makeStep("x")],
    } as never);
    expect(result.title).toBe("Dynamic");
    expect(result.purpose).toBe("Steps: 1");
  });

  it("Phase is an alias for PipelinePhase", () => {
    expect(Phase).toBe(PipelinePhase);
  });
});
