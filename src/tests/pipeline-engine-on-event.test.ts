import { describe, it, expect } from "vitest";
import { runPipelineEngine } from "../lib/pipeline-engine.js";
import { PipelinePauseError } from "../lib/errors/pipeline-pause-error.js";
import type {
  PipelineEvent,
  PipelineEventCallback,
  PipelineStepContext,
  PipelineStepLike,
  PipelineArtifacts,
  PipelineContextFactory,
} from "../lib/pipeline-types.js";

type TestState = Record<string, never>;
type TestContext = PipelineStepContext<TestState>;

const createMockContext = (options: {
  stepArtifactsById: Map<string, PipelineArtifacts<TestContext>>;
  stepNumbers: Map<string, number>;
  state: TestState;
}): TestContext => {
  const outputDir = "/tmp/test-output";
  return {
    state: options.state,
    currentStepId: null,
    runNamespace: {
      outputRootDir: outputDir,
      lockedInputs: {},
      reuseSource: "local_artifacts",
    },
    getPipelineOutputDir: () => outputDir,
    getStepNumber: (stepId: string) => options.stepNumbers.get(stepId) ?? 0,
    getStepOutputDir: (stepId: string) => `${outputDir}/${stepId}`,
    getOutputPath: (stepId: string, base: string) => `${outputDir}/${stepId}/${base}`,
    getStepArtifactPath: (stepId: string, artifactId: string) =>
      `${outputDir}/${stepId}/${artifactId}`,
    ensureOutputDir: async () => {},
    fileExists: async () => false,
    assertStepArtifactValid: async () => {},
    logStepEvent: async () => {},
  };
};

const createTestStep = (
  id: string,
  runImpl?: (ctx: TestContext) => Promise<void>,
): PipelineStepLike<TestContext> => ({
  id,
  artifacts: {},
  retryPolicy: "none",
  reusePolicy: "always_run",
  run: runImpl ?? (async () => {}),
});

const createContextFactory = (): PipelineContextFactory<TestState, TestContext> => {
  return (options) =>
    createMockContext({
      stepArtifactsById: options.stepArtifactsById,
      stepNumbers: options.stepNumbers,
      state: options.state,
    });
};

describe("runPipelineEngine onEvent", () => {
  it("emits pipeline_started and pipeline_completed for successful run", async () => {
    const events: PipelineEvent[] = [];
    const onEvent: PipelineEventCallback = (event) => events.push(event);

    const steps = [createTestStep("a"), createTestStep("b")];

    await runPipelineEngine({
      steps,
      initialState: {} as Record<string, never>,
      createContext: createContextFactory(),
      onEvent,
    });

    const types = events.map((e) => e.type);
    expect(types[0]).toBe("pipeline_started");
    expect(types.at(-1)).toBe("pipeline_completed");
    const started = events.find((e) => e.type === "pipeline_started");
    expect(started?.type === "pipeline_started" && started.totalSteps).toBe(2);
  });

  it("emits step_started and step_completed for each step", async () => {
    const events: PipelineEvent[] = [];
    const onEvent: PipelineEventCallback = (event) => events.push(event);

    const steps = [createTestStep("a"), createTestStep("b")];

    await runPipelineEngine({
      steps,
      initialState: {} as Record<string, never>,
      createContext: createContextFactory(),
      onEvent,
    });

    const types = events.map((e) => e.type);
    expect(types).toContain("step_started");
    expect(types).toContain("step_completed");

    const stepStartedEvents = events.filter((e) => e.type === "step_started");
    expect(stepStartedEvents).toHaveLength(2);
    if (stepStartedEvents[0].type === "step_started") {
      expect(stepStartedEvents[0].stepId).toBe("a");
      expect(stepStartedEvents[0].stepNumber).toBe(1);
    }
    if (stepStartedEvents[1].type === "step_started") {
      expect(stepStartedEvents[1].stepId).toBe("b");
      expect(stepStartedEvents[1].stepNumber).toBe(2);
    }

    const stepCompletedEvents = events.filter((e) => e.type === "step_completed");
    expect(stepCompletedEvents).toHaveLength(2);
  });

  it("emits step_failed when step.run throws", async () => {
    const events: PipelineEvent[] = [];
    const onEvent: PipelineEventCallback = (event) => events.push(event);

    const steps = [
      createTestStep("a", async () => {
        throw new Error("step a failed");
      }),
    ];

    await expect(
      runPipelineEngine({
        steps,
        initialState: {} as Record<string, never>,
        createContext: createContextFactory(),
        onEvent,
      }),
    ).rejects.toThrow("step a failed");

    const failedEvent = events.find((e) => e.type === "step_failed");
    expect(failedEvent).toBeDefined();
    if (failedEvent?.type === "step_failed") {
      expect(failedEvent.stepId).toBe("a");
      expect(failedEvent.error).toBe("step a failed");
    }
  });

  it("emits pipeline_paused when PipelinePauseError is thrown", async () => {
    const events: PipelineEvent[] = [];
    const onEvent: PipelineEventCallback = (event) => events.push(event);

    const steps = [
      createTestStep("a", async () => {
        throw new PipelinePauseError("manual pause");
      }),
    ];

    await expect(
      runPipelineEngine({
        steps,
        initialState: {} as Record<string, never>,
        createContext: createContextFactory(),
        onEvent,
      }),
    ).rejects.toThrow("manual pause");

    const pausedEvent = events.find((e) => e.type === "pipeline_paused");
    expect(pausedEvent).toBeDefined();
    if (pausedEvent?.type === "pipeline_paused") {
      expect(pausedEvent.reason).toBe("manual pause");
      expect(pausedEvent.stepId).toBe("a");
    }
  });

  it("does not emit events when onEvent is not provided", async () => {
    const steps = [createTestStep("a")];

    await expect(
      runPipelineEngine({
        steps,
        initialState: {} as Record<string, never>,
        createContext: createContextFactory(),
      }),
    ).resolves.toBeDefined();
  });

  it("emits step_started with title from guide", async () => {
    const events: PipelineEvent[] = [];
    const onEvent: PipelineEventCallback = (event) => events.push(event);

    const steps = [
      {
        ...createTestStep("a"),
        guide: {
          title: "My Custom Title",
          purpose: "test",
          inputs: [],
          outputs: [],
          definitionOfDone: [],
          decisionType: "auto" as const,
        },
      },
    ];

    await runPipelineEngine({
      steps,
      initialState: {} as Record<string, never>,
      createContext: createContextFactory(),
      onEvent,
    });

    const startedEvent = events.find((e) => e.type === "step_started" && e.stepId === "a");
    if (startedEvent?.type === "step_started") {
      expect(startedEvent.title).toBe("My Custom Title");
    }
  });

  it("emits step_started with stepId as title when guide has no title", async () => {
    const events: PipelineEvent[] = [];
    const onEvent: PipelineEventCallback = (event) => events.push(event);

    const steps = [createTestStep("a")];

    await runPipelineEngine({
      steps,
      initialState: {} as Record<string, never>,
      createContext: createContextFactory(),
      onEvent,
    });

    const startedEvent = events.find((e) => e.type === "step_started" && e.stepId === "a");
    if (startedEvent?.type === "step_started") {
      expect(startedEvent.title).toBe("a");
    }
  });
});
