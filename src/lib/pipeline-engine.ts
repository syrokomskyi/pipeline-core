/*
<MODULE_CONTRACT>
<purpose>Executes a declared pipeline of steps with dry-run, range selection, reuse, retry, and guide artifact support.</purpose>
<non-goals>
  <item>Does not implement selection logic, prompt checks, or guide rendering directly (see pipeline-engine-helpers.ts).</item>
  <item>Does not define pipeline types or error classes.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Extracted internal helpers into pipeline-engine-helpers.ts to keep the engine file under 600 lines.</item>
  <item>Added optional onEvent callback to emit key pipeline events (started, step_started, step_completed, step_failed, step_skipped, pipeline_completed, pipeline_paused).</item>
  <item>Enriched pipeline_paused events with pauseType, message, declarationText, availableArtifacts, and requiredFiles via buildPauseContext helper.</item>
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
  appendJsonLine,
  assertStepPromptTemplateReady,
  backupInvalidOutputArtifact,
  buildPauseContext,
  buildSelectedStepIdSet,
  classifyArtifactValidationError,
  completePhaseIfNeeded,
  getErrorMessage,
  printStepGuide,
  writeGuideArtifacts,
  writeStepGuideArtifact,
} from "./pipeline-engine-helpers.js";

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
    for (const artifactId of Object.keys(artifacts)) {
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

    for (const artifactId of Object.keys(artifacts)) {
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
      currentPhaseIds = currentPhaseIds.filter((phaseId) => {
        const phase = options.guide?.phases.find((candidate) => candidate.id === phaseId);
        if (!phase) {
          return false;
        }

        const lastSelectedStepId = phase.stepIds
          .filter((candidateStepId) => selectedStepIds.has(candidateStepId))
          .at(-1);

        return lastSelectedStepId !== step.id;
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
      currentPhaseIds = currentPhaseIds.filter((phaseId) => {
        const phase = options.guide?.phases.find((candidate) => candidate.id === phaseId);
        if (!phase) {
          return false;
        }

        const lastSelectedStepId = phase.stepIds
          .filter((candidateStepId) => selectedStepIds.has(candidateStepId))
          .at(-1);

        return lastSelectedStepId !== step.id;
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

    emit?.({
      type: "step_started",
      stepId: step.id,
      stepNumber: ctx.getStepNumber(step.id),
      title: stepGuideTitle(step.id),
    });

    try {
      await appendJsonLine(ctx.getOutputPath(step.id, "log.txt"), {
        timestamp: new Date().toISOString(),
        event: "step_started",
        stepId: step.id,
        stepNumber: ctx.getStepNumber(step.id),
        status: "started",
      });
    } catch (error) {
      console.error(`Failed to write log.txt for ${step.id}:`, error);
    }

    const runOnce = async (attempt: 1 | 2) => {
      await ctx.logStepEvent({
        event: "step_run_started",
        stepId: step.id,
        attempt,
        status: "running",
      });
      console.log(
        `${attempt === 2 ? "retry:" : "run:"} ${step.id}${attempt === 2 ? " (attempt 2)" : ""} running...`,
      );
      await step.run(ctx);
      await ctx.logStepEvent({
        event: "step_run_finished",
        stepId: step.id,
        attempt,
        status: "completed",
      });
      await ctx.logStepEvent({
        event: "step_validation_started",
        stepId: step.id,
        attempt,
        status: "running",
      });
      await assertAllArtifactsValid(step.id);
      await ctx.logStepEvent({
        event: "step_validation_finished",
        stepId: step.id,
        attempt,
        status: "completed",
      });
      console.log(`ok: ${step.id} output validated.`);
    };

    try {
      await runOnce(1);
      emit?.({
        type: "step_completed",
        stepId: step.id,
        stepNumber: ctx.getStepNumber(step.id),
      });
    } catch (error) {
      emit?.({
        type: "step_failed",
        stepId: step.id,
        stepNumber: ctx.getStepNumber(step.id),
        error: getErrorMessage(error),
      });
      await ctx.logStepEvent({
        event: "step_run_failed",
        stepId: step.id,
        attempt: 1,
        status: "failed",
        details: {
          error: getErrorMessage(error),
        },
      });
      if (error instanceof PipelinePauseError) {
        const pauseReason = getErrorMessage(error);
        const pauseContext = await buildPauseContext({
          stepId: step.id,
          reason: pauseReason,
          stepGuidesById,
          stepArtifactsById,
          ctx,
        });
        emit?.({
          type: "pipeline_paused",
          reason: pauseReason,
          stepId: step.id,
          ...pauseContext,
        });
        throw error;
      }

      const artifactError = await classifyArtifactValidationError({
        assertAllArtifactsValid,
        error,
        stepId: step.id,
      });

      if (!artifactError) {
        throw error;
      }

      if (artifactError.ownerStepId !== step.id) {
        await ctx.logStepEvent({
          event: "step_paused",
          stepId: step.id,
          attempt: 1,
          status: "paused",
          artifactId: artifactError.artifactId,
          details: {
            ownerStepId: artifactError.ownerStepId,
            reason: "invalid_upstream_artifact",
          },
        });
        const upstreamReason = `Invalid upstream artifact: ${artifactError.ownerStepId}:${artifactError.artifactId}`;
        const pauseContext = await buildPauseContext({
          stepId: step.id,
          reason: upstreamReason,
          stepGuidesById,
          stepArtifactsById,
          ctx,
        });
        emit?.({
          type: "pipeline_paused",
          reason: upstreamReason,
          stepId: step.id,
          ...pauseContext,
        });
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

      if (step.retryPolicy === "none") {
        await ctx.logStepEvent({
          event: "step_paused",
          stepId: step.id,
          attempt: 1,
          status: "paused",
          artifactId: artifactError.artifactId,
          details: {
            reason: "output_validation_failed_without_retry",
          },
        });
        const noRetryReason = `Output validation failed without retry: ${artifactError.message}`;
        const pauseContextNoRetry = await buildPauseContext({
          stepId: step.id,
          reason: noRetryReason,
          stepGuidesById,
          stepArtifactsById,
          ctx,
        });
        emit?.({
          type: "pipeline_paused",
          reason: noRetryReason,
          stepId: step.id,
          ...pauseContextNoRetry,
        });
        throw new PipelinePauseError(
          [
            `Pipeline paused by ${step.id}.`,
            "Output validation failed.",
            artifactError.message,
            "This step does not support automatic retry.",
          ].join("\n"),
        );
      }

      console.error(`warn: ${step.id} output validation failed. Retrying once...`);
      await ctx.logStepEvent({
        event: "step_retry_scheduled",
        stepId: step.id,
        attempt: 2,
        status: "scheduled",
        artifactId: artifactError.artifactId,
        details: {
          reason: "output_validation_failed",
        },
      });
      await backupInvalidOutputArtifact({
        ctx,
        attempt: 1,
        artifactId: artifactError.artifactId,
        stepId: step.id,
      });
      await ctx.logStepEvent({
        event: "artifact_backed_up",
        stepId: step.id,
        attempt: 1,
        status: "completed",
        artifactId: artifactError.artifactId,
        details: {
          backupSuffix: ".invalid-1",
        },
      });

      try {
        await runOnce(2);
        emit?.({
          type: "step_completed",
          stepId: step.id,
          stepNumber: ctx.getStepNumber(step.id),
        });
      } catch (error2) {
        emit?.({
          type: "step_failed",
          stepId: step.id,
          stepNumber: ctx.getStepNumber(step.id),
          error: getErrorMessage(error2),
        });
        await ctx.logStepEvent({
          event: "step_run_failed",
          stepId: step.id,
          attempt: 2,
          status: "failed",
          details: {
            error: getErrorMessage(error2),
          },
        });
        if (error2 instanceof PipelinePauseError) {
          const pauseReason2 = getErrorMessage(error2);
          const pauseContext2 = await buildPauseContext({
            stepId: step.id,
            reason: pauseReason2,
            stepGuidesById,
            stepArtifactsById,
            ctx,
          });
          emit?.({
            type: "pipeline_paused",
            reason: pauseReason2,
            stepId: step.id,
            ...pauseContext2,
          });
          throw error2;
        }

        const artifactError2 = await classifyArtifactValidationError({
          assertAllArtifactsValid,
          error: error2,
          stepId: step.id,
        });

        if (artifactError2 && artifactError2.ownerStepId === step.id) {
          await backupInvalidOutputArtifact({
            ctx,
            attempt: 2,
            artifactId: artifactError2.artifactId,
            stepId: step.id,
          });
          await ctx.logStepEvent({
            event: "artifact_backed_up",
            stepId: step.id,
            attempt: 2,
            status: "completed",
            artifactId: artifactError2.artifactId,
            details: {
              backupSuffix: ".invalid-2",
            },
          });
          await ctx.logStepEvent({
            event: "step_paused",
            stepId: step.id,
            attempt: 2,
            status: "paused",
            artifactId: artifactError2.artifactId,
            details: {
              reason: "output_validation_failed_twice",
            },
          });
          const failedTwiceReason = `Output validation failed twice: ${artifactError2.message}`;
          const pauseContextFailedTwice = await buildPauseContext({
            stepId: step.id,
            reason: failedTwiceReason,
            stepGuidesById,
            stepArtifactsById,
            ctx,
          });
          emit?.({
            type: "pipeline_paused",
            reason: failedTwiceReason,
            stepId: step.id,
            ...pauseContextFailedTwice,
          });
          throw new PipelinePauseError(
            [
              `Pipeline paused by ${step.id}.`,
              "Output validation failed twice.",
              artifactError2.message,
              "Check the *.invalid-1 / *.invalid-2 backups in this step output directory and rerun.",
            ].join("\n"),
          );
        }

        throw error2;
      }
    }

    await completePhaseIfNeeded({ ctx, guide: options.guide, selectedStepIds, stepId: step.id });
    currentPhaseIds = currentPhaseIds.filter((phaseId) => {
      const phase = options.guide?.phases.find((candidate) => candidate.id === phaseId);
      if (!phase) {
        return false;
      }

      const lastSelectedStepId = phase.stepIds
        .filter((candidateStepId) => selectedStepIds.has(candidateStepId))
        .at(-1);

      return lastSelectedStepId !== step.id;
    });
  }

  emit?.({ type: "pipeline_completed" });
  ctx.currentStepId = null;
  return ctx;
};
