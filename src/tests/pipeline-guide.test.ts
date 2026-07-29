import { describe, it, expect } from "vitest";
import {
  createPipelineExplainContext,
  createPipelineExecutionGuide,
  findPipelinePhaseByStepId,
  formatPipelineStepDecisionType,
  renderPipelineStepGuideMarkdown,
  renderPipelinePhaseGuideMarkdown,
  renderPipelineExecutionGuideMarkdown,
  renderFullPipelineDocumentationMarkdown,
} from "../lib/pipeline-guide.js";
import { definePipeline } from "../lib/define-pipeline.js";
import { PipelinePhase } from "../lib/pipeline-phase.js";
import { PipelineStep } from "../lib/pipeline-step.js";

class TestStep extends PipelineStep {
  readonly id: string;
  constructor(id: string) {
    super();
    this.id = id;
  }
  async run(): Promise<void> {}
}

function makeSimpleDefinition() {
  const s1 = new TestStep("s1");
  const s2 = new TestStep("s2");
  s1.withExplanation({
    title: "Step One",
    purpose: "Does step one",
    inputs: ["input-a"],
    outputs: ["output-a"],
    definitionOfDone: ["done-a"],
  });
  s2.withExplanation({
    title: "Step Two",
    purpose: "Does step two",
    inputs: ["input-b"],
  });
  const phase = new PipelinePhase({
    id: "phase-1",
    members: [s1, s2],
    explain: { title: "Phase 1", purpose: "First phase" },
  });
  return definePipeline({
    title: "Test Pipeline",
    summary: "A test pipeline",
    phases: [phase],
  });
}

describe("formatPipelineStepDecisionType", () => {
  it("returns 'Auto' for auto", () => {
    expect(formatPipelineStepDecisionType("auto")).toBe("Auto");
  });
  it("returns 'Human confirms' for human_confirms", () => {
    expect(formatPipelineStepDecisionType("human_confirms")).toBe("Human confirms");
  });
  it("returns 'Client chooses' for client_chooses", () => {
    expect(formatPipelineStepDecisionType("client_chooses")).toBe("Client chooses");
  });
  it("returns 'Human provides content' for human_provides_content", () => {
    expect(formatPipelineStepDecisionType("human_provides_content")).toBe("Human provides content");
  });
  it("returns 'Human reviews' for human_reviews", () => {
    expect(formatPipelineStepDecisionType("human_reviews")).toBe("Human reviews");
  });
});

describe("createPipelineExplainContext", () => {
  it("findStep returns step by id", () => {
    const def = makeSimpleDefinition();
    const ctx = createPipelineExplainContext(def);
    expect(ctx.findStep("s1")?.id).toBe("s1");
    expect(ctx.findStep("unknown")).toBeNull();
  });

  it("findPhase returns phase by id", () => {
    const def = makeSimpleDefinition();
    const ctx = createPipelineExplainContext(def);
    expect(ctx.findPhase("phase-1")?.id).toBe("phase-1");
    expect(ctx.findPhase("unknown")).toBeNull();
  });

  it("getStepNumber returns correct number", () => {
    const def = makeSimpleDefinition();
    const ctx = createPipelineExplainContext(def);
    expect(ctx.getStepNumber("s1")).toBe(1);
    expect(ctx.getStepNumber("s2")).toBe(2);
    expect(ctx.getStepNumber("unknown")).toBeUndefined();
  });

  it("getPreviousStep returns the step before", () => {
    const def = makeSimpleDefinition();
    const ctx = createPipelineExplainContext(def);
    expect(ctx.getPreviousStep("s2")?.id).toBe("s1");
    expect(ctx.getPreviousStep("s1")).toBeNull();
  });

  it("getNextStep returns the step after", () => {
    const def = makeSimpleDefinition();
    const ctx = createPipelineExplainContext(def);
    expect(ctx.getNextStep("s1")?.id).toBe("s2");
    expect(ctx.getNextStep("s2")).toBeNull();
  });

  it("getPhaseForStep returns the containing phase", () => {
    const def = makeSimpleDefinition();
    const ctx = createPipelineExplainContext(def);
    expect(ctx.getPhaseForStep("s1")?.id).toBe("phase-1");
  });

  it("getPhaseStackForStep returns stack for nested phases", () => {
    const inner = new PipelinePhase({
      id: "inner",
      members: [new TestStep("s1")],
      explain: { title: "Inner", purpose: "i" },
    });
    const outer = new PipelinePhase({
      id: "outer",
      members: [inner],
      explain: { title: "Outer", purpose: "o" },
    });
    const def = definePipeline({ title: "T", summary: "S", phases: [outer] });
    const ctx = createPipelineExplainContext(def);
    const stack = ctx.getPhaseStackForStep("s1");
    expect(stack.map((p) => p.id)).toEqual(["outer", "inner"]);
  });
});

describe("createPipelineExecutionGuide", () => {
  it("creates guide with title and summary", () => {
    const def = makeSimpleDefinition();
    const guide = createPipelineExecutionGuide(def);
    expect(guide.title).toBe("Test Pipeline");
    expect(guide.summary).toBe("A test pipeline");
  });

  it("populates step guides", () => {
    const def = makeSimpleDefinition();
    createPipelineExecutionGuide(def);
    const s1 = def.steps[0]!;
    expect(s1.guide).toBeDefined();
    expect(s1.guide?.title).toBe("Step One");
  });

  it("populates phase guides with step ids", () => {
    const def = makeSimpleDefinition();
    const guide = createPipelineExecutionGuide(def);
    expect(guide.phases).toHaveLength(1);
    expect(guide.phases[0]!.id).toBe("phase-1");
    expect(guide.phases[0]!.stepIds).toEqual(["s1", "s2"]);
  });

  it("sets nextStep on guide", () => {
    const def = makeSimpleDefinition();
    createPipelineExecutionGuide(def);
    const s1 = def.steps[0]!;
    expect(s1.guide?.nextStep).toContain("Step Two");
  });
});

describe("findPipelinePhaseByStepId", () => {
  it("returns the deepest phase containing the step", () => {
    const def = makeSimpleDefinition();
    const guide = createPipelineExecutionGuide(def);
    const phase = findPipelinePhaseByStepId(guide, "s1");
    expect(phase?.id).toBe("phase-1");
  });

  it("returns null when guide is undefined", () => {
    expect(findPipelinePhaseByStepId(undefined, "s1")).toBeNull();
  });

  it("returns null when step is not found", () => {
    const def = makeSimpleDefinition();
    const guide = createPipelineExecutionGuide(def);
    expect(findPipelinePhaseByStepId(guide, "unknown")).toBeNull();
  });
});

describe("renderPipelineStepGuideMarkdown", () => {
  it("renders step with title and purpose", () => {
    const def = makeSimpleDefinition();
    createPipelineExecutionGuide(def);
    const md = renderPipelineStepGuideMarkdown({
      stepId: "s1",
      stepNumber: 1,
      guide: def.steps[0]!.guide!,
    });
    expect(md).toContain("# Step 1: Step One");
    expect(md).toContain("Does step one");
    expect(md).toContain("input-a");
  });

  it("renders AI Model Usage section when aiModelUsage is present", () => {
    const def = makeSimpleDefinition();
    createPipelineExecutionGuide(def);
    const guide = def.steps[0]!.guide!;
    guide.aiModelUsage = [
      { modelSource: "brief.synthesisModel", maxTokens: 4000, purpose: "Decompose topic" },
    ];
    const md = renderPipelineStepGuideMarkdown({
      stepId: "s1",
      stepNumber: 1,
      guide,
    });
    expect(md).toContain("## AI Model Usage");
    expect(md).toContain("brief.synthesisModel");
    expect(md).toContain("4000");
    expect(md).toContain("Decompose topic");
  });

  it("does not render AI Model Usage section when aiModelUsage is absent", () => {
    const def = makeSimpleDefinition();
    createPipelineExecutionGuide(def);
    const md = renderPipelineStepGuideMarkdown({
      stepId: "s1",
      stepNumber: 1,
      guide: def.steps[0]!.guide!,
    });
    expect(md).not.toContain("## AI Model Usage");
  });
});

describe("renderPipelinePhaseGuideMarkdown", () => {
  it("renders phase with title and steps", () => {
    const def = makeSimpleDefinition();
    const guide = createPipelineExecutionGuide(def);
    const md = renderPipelinePhaseGuideMarkdown({
      phase: guide.phases[0]!,
      stepNumbers: new Map([
        ["s1", 1],
        ["s2", 2],
      ]),
      stepGuidesById: new Map(def.steps.map((s) => [s.id, s.guide])),
    });
    expect(md).toContain("# Phase 1");
    expect(md).toContain("First phase");
    expect(md).toContain("s1");
    expect(md).toContain("s2");
  });
});

describe("renderFullPipelineDocumentationMarkdown", () => {
  it("renders full documentation with all sections", () => {
    const def = makeSimpleDefinition();
    const md = renderFullPipelineDocumentationMarkdown(def);
    expect(md).toContain("# Test Pipeline");
    expect(md).toContain("A test pipeline");
    expect(md).toContain("## Route");
    expect(md).toContain("Phase 1");
    expect(md).toContain("Step One");
    expect(md).toContain("Step Two");
  });
});

describe("renderPipelineExecutionGuideMarkdown - AI Model Usage Summary", () => {
  it("renders AI Model Usage Summary table when steps have aiModelUsage", () => {
    const def = makeSimpleDefinition();
    const guide = createPipelineExecutionGuide(def);
    def.steps[0]!.guide!.aiModelUsage = [
      { modelSource: "brief.synthesisModel", maxTokens: 4000, purpose: "Decompose topic" },
    ];
    def.steps[1]!.guide!.aiModelUsage = [
      { modelSource: "brief.models", maxTokens: 8000, purpose: "Inquiry per model" },
    ];
    const stepNumbers = new Map([
      ["s1", 1],
      ["s2", 2],
    ]);
    const stepGuidesById = new Map(def.steps.map((s) => [s.id, s.guide]));
    const md = renderPipelineExecutionGuideMarkdown({ guide, stepNumbers, stepGuidesById });
    expect(md).toContain("## AI Model Usage Summary");
    expect(md).toContain("brief.synthesisModel");
    expect(md).toContain("brief.models");
    expect(md).toContain("4000");
    expect(md).toContain("8000");
  });

  it("does not render AI Model Usage Summary when no steps have aiModelUsage", () => {
    const def = makeSimpleDefinition();
    const guide = createPipelineExecutionGuide(def);
    const stepNumbers = new Map([
      ["s1", 1],
      ["s2", 2],
    ]);
    const stepGuidesById = new Map(def.steps.map((s) => [s.id, s.guide]));
    const md = renderPipelineExecutionGuideMarkdown({ guide, stepNumbers, stepGuidesById });
    expect(md).not.toContain("## AI Model Usage Summary");
  });
});
