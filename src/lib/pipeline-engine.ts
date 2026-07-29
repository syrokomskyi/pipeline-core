/*
<MODULE_CONTRACT>
<purpose>Executes a declared pipeline of steps with dry-run, range selection, reuse, retry, and guide artifact support.</purpose>
<non-goals>
  <item>Does not implement selection logic, prompt checks, or guide rendering directly (see pipeline-engine-helpers.ts).</item>
  <item>Does not implement the retry/pause state machine for individual steps (see step-runner.ts).</item>
  <item>Does not define pipeline types or error classes.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Extracted internal helpers into pipeline-engine-helpers.ts to keep the engine file under 600 lines.</item>
  <item>Added optional onEvent callback to emit key pipeline events (started, step_started, step_completed, step_failed, step_skipped, pipeline_completed, pipeline_paused).</item>
  <item>Enriched pipeline_paused events with pauseType, message, declarationText, availableArtifacts, and requiredFiles via buildPauseContext helper.</item>
  <item>Extracted retry/pause state machine into step-runner.ts (runStepWithRetry) and phase-advance logic into advancePhasesAfterStep.</item>
</CHANGE_SUMMARY>
*/

import {
  formatDryRunSummary,
  formatForceSummary,
  formatPhaseStart,
  formatSkippedStep,
} from "./console-format.js";
import { ArtifactValidationError } from "./errors/artifact-validation-error.js";
import { PipelinePauseError } from "./errors/pipeline-pause-error.js";
import type {
  PipelineExecutionGuide,
  PipelineContextFactory,
  PipelineEventCallback,
  PipelineRunNamespace,
  PipelineRunOptions,
  PipelineStepContext,
  PipelineStepLike,
  PipelineArtifacts,
} from "./pipeline-types.js";
import {
  assertStepPromptTemplateReady,
  buildSelectedStepIdSet,
  classifyArtifactValidationError,
  completePhaseIfNeeded,
  getErrorMessage,
  printStepGuide,
  writeGuideArtifacts,
  writeStepGuideArtifact,
} from "./pipeline-engine-helpers.js";
import { advancePhasesAfterStep, runStepWithRetry } from "./step-runner.js";

export const runPipelineEngine = async <
  TState,
  TContext extends PipelineStepContext<TState>,
  TStep extends PipelineStepLike<TContext>,
>(options: {
  steps: TStep[];
  initialState: TState;
  createContext: PipelineContextFactory<TState, TContext>;
  guide?: PipelineExecutionGuide;
  options?: PipelineRunOptions;
  runNamespace?: PipelineRunNamespace;
  onEvent?: PipelineEventCallback;
}): Promise<TContext> => {
  const emit = options.onEvent;
  const stepGuideTitle = (stepId: string): string => stepGuidesById.get(stepId)?.title ?? stepId;
  const runOptions = options.options ?? {};
  const stepNumbers = new Map<string, number>(
    options.steps.map((step, index) => [step.id, index + 1]),
  );
  const stepArtifactsById = new Map<string, PipelineArtifacts<TContext>>(
    options.steps.map((step) => [step.id, step.artifacts]),
  );
  const stepsById = new Map(options.steps.map((step) => [step.id, step]));
  const stepGuidesById = new Map(options.steps.map((step) => [step.id, step.guide]));
  const selectedStepIds = buildSelectedStepIdSet({
    steps: options.steps,
    runOptions,
  });
  const ctx = options.createContext({
    stepArtifactsById,
    stepNumbers,
    runNamespace: options.runNamespace ?? {
      outputRootDir: "",
      lockedInputs: {},
      reuseSource: "local_artifacts",
    },
    state: options.initialState,
  });

  const assertAllArtifactsValid = async (stepId: string) => {
    const artifacts = stepArtifactsById.get(stepId) ?? {};
    const step = stepsById.get(stepId);
    const activeIds = step?.getActiveArtifactIds
      ? await step.getActiveArtifactIds(ctx)
      : Object.keys(artifacts);
    for (const artifactId of activeIds) {
      await ctx.assertStepArtifactValid(stepId, artifactId);
    }
  };

  const hasAllArtifactsValid = async (stepId: string): Promise<boolean> => {
    try {
      await assertAllArtifactsValid(stepId);
      return true;
    } catch (error) {
      if (error instanceof ArtifactValidationError) {
        return false;
      }

      throw error;
    }
  };

  const hasDeclaredArtifacts = (stepId: string): boolean => {
    const artifacts = stepArtifactsById.get(stepId) ?? {};
    return Object.keys(artifacts).length > 0;
  };

  if (runOptions.dryRun) {
    await writeGuideArtifacts({ ctx, guide: options.guide, stepNumbers, stepGuidesById });
    console.log(
      `\n${formatDryRunSummary(
        options.steps
          .filter((step) => selectedStepIds.has(step.id))
          .map((step) => ({
            stepId: step.id,
            outputDir: ctx.getStepOutputDir(step.id),
          })),
      )}`,
    );
    ctx.currentStepId = null;
    return ctx;
  }

  if ((runOptions.force?.length ?? 0) > 0) {
    console.log(`\n${formatForceSummary(runOptions.force ?? [])}`);
  }

  const forcedStepIds = new Set(runOptions.force ?? []);
  await writeGuideArtifacts({ ctx, guide: options.guide, stepNumbers, stepGuidesById });
  let currentPhaseIds: string[] = [];

  const selectedSteps = options.steps.filter((step) => selectedStepIds.has(step.id));
  emit?.({ type: "pipeline_started", totalSteps: selectedSteps.length });

  const stepHasExistingArtifacts = async (stepId: string): Promise<boolean> => {
    const artifacts = stepArtifactsById.get(stepId) ?? {};
    const step = stepsById.get(stepId);
    const activeIds = step?.getActiveArtifactIds
      ? await step.getActiveArtifactIds(ctx)
      : Object.keys(artifacts);

    for (const artifactId of activeIds) {
      const artifactPath = ctx.getStepArtifactPath(stepId, artifactId);
      if (await ctx.fileExists(artifactPath)) {
        return true;
      }
    }

    return false;
  };

  for (const step of options.steps) {
    if (!selectedStepIds.has(step.id)) {
      console.log(formatSkippedStep(step.id, "outside selected execution scope"));
      continue;
    }

    ctx.currentStepId = step.id;
    const phaseStack = options.guide
      ? options.guide.phases
          .filter((phase) => phase.stepIds.includes(step.id))
          .sort((a, b) => (a.depth ?? 0) - (b.depth ?? 0))
      : [];
    let sharedPhaseCount = 0;
    while (
      sharedPhaseCount < currentPhaseIds.length &&
      sharedPhaseCount < phaseStack.length &&
      currentPhaseIds[sharedPhaseCount] === phaseStack[sharedPhaseCount]?.id
    ) {
      sharedPhaseCount += 1;
    }

    currentPhaseIds = currentPhaseIds.slice(0, sharedPhaseCount);

    for (const phase of phaseStack.slice(sharedPhaseCount)) {
      currentPhaseIds.push(phase.id);
      console.log(`\n${formatPhaseStart(phase)}`);
      await ctx.logStepEvent({
        event: "phase_started",
        stepId: step.id,
        status: "started",
        allowCreateStepOutputDir: false,
        details: {
          phaseId: phase.id,
          phaseTitle: phase.title,
        },
      });
    }

    printStepGuide({ steps: options.steps, stepId: step.id, stepNumbers, guide: options.guide });

    if (
      step.reusePolicy === "reuse_valid_artifacts" &&
      hasDeclaredArtifacts(step.id) &&
      !forcedStepIds.has(step.id) &&
      (await stepHasExistingArtifacts(step.id)) &&
      (await hasAllArtifactsValid(step.id))
    ) {
      console.log(`Skipping step ${step.id}: reusing valid artifacts`);
      emit?.({
        type: "step_skipped",
        stepId: step.id,
        stepNumber: ctx.getStepNumber(step.id),
        reason: "all_artifacts_valid",
      });
      await ctx.logStepEvent({
        event: "step_reused",
        stepId: step.id,
        status: "completed",
        details: {
          reason: "all_artifacts_valid",
        },
      });
      await step.hydrateFromArtifacts?.(ctx);
      await completePhaseIfNeeded({ ctx, guide: options.guide, selectedStepIds, stepId: step.id });
      currentPhaseIds = advancePhasesAfterStep({
        guide: options.guide,
        stepId: step.id,
        selectedStepIds,
        currentPhaseIds,
      });
      continue;
    }

    const shouldSkipStep = await step.shouldSkip?.(ctx);

    if (shouldSkipStep) {
      await ctx.ensureOutputDir(ctx.getStepOutputDir(step.id));
      await writeStepGuideArtifact({
        ctx,
        steps: options.steps,
        stepId: step.id,
        stepNumbers,
        guide: options.guide,
      });
      console.log(formatSkippedStep(step.id, "explicitly skipped by step configuration"));
      emit?.({
        type: "step_skipped",
        stepId: step.id,
        stepNumber: ctx.getStepNumber(step.id),
        reason: "step_should_skip",
      });
      await ctx.logStepEvent({
        event: "step_skipped",
        stepId: step.id,
        status: "completed",
        details: {
          reason: "step_should_skip",
        },
      });
      await completePhaseIfNeeded({ ctx, guide: options.guide, selectedStepIds, stepId: step.id });
      currentPhaseIds = advancePhasesAfterStep({
        guide: options.guide,
        stepId: step.id,
        selectedStepIds,
        currentPhaseIds,
      });
      continue;
    }

    try {
      await assertStepPromptTemplateReady({ ctx, step });
      await step.validateBeforeStart?.(ctx);
    } catch (error) {
      await ctx.logStepEvent({
        event: "step_paused",
        stepId: step.id,
        status: "paused",
        allowCreateStepOutputDir: false,
        details: {
          reason:
            error instanceof PipelinePauseError
              ? "input_validation_paused"
              : "input_validation_failed",
          error: getErrorMessage(error),
        },
      });

      if (error instanceof PipelinePauseError) {
        emit?.({
          type: "pipeline_paused",
          reason: getErrorMessage(error),
          stepId: step.id,
        });
        throw error;
      }

      const artifactError = await classifyArtifactValidationError({
        assertAllArtifactsValid,
        error,
        stepId: step.id,
      });

      if (artifactError) {
        throw new PipelinePauseError(
          [
            `Pipeline paused by ${step.id}.`,
            "Invalid input artifact produced by another step.",
            "The pipeline operator should review the step guide above, fix the upstream artifact, and rerun.",
            `Upstream: ${artifactError.ownerStepId}:${artifactError.artifactId}`,
            artifactError.message,
            "Fix the upstream output and rerun.",
          ].join("\n"),
        );
      }

      throw new PipelinePauseError(
        [
          `Pipeline paused by ${step.id}.`,
          "Input validation failed before step execution.",
          "The pipeline operator should review the step guide above, fix the missing or invalid input, and rerun.",
          getErrorMessage(error),
        ].join("\n"),
      );
    }

    await ctx.ensureOutputDir(ctx.getStepOutputDir(step.id));
    await writeStepGuideArtifact({
      ctx,
      steps: options.steps,
      stepId: step.id,
      stepNumbers,
      guide: options.guide,
    });

    await runStepWithRetry({
      step,
      ctx,
      emit,
      stepGuideTitle,
      assertAllArtifactsValid,
      stepGuidesById,
      stepArtifactsById,
    });

    await completePhaseIfNeeded({ ctx, guide: options.guide, selectedStepIds, stepId: step.id });
    currentPhaseIds = advancePhasesAfterStep({
      guide: options.guide,
      stepId: step.id,
      selectedStepIds,
      currentPhaseIds,
    });
  }

  emit?.({ type: "pipeline_completed" });
  ctx.currentStepId = null;
  return ctx;
};
