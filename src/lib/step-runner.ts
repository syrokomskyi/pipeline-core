/*
<MODULE_CONTRACT>
<purpose>Runs a single pipeline step with retry, pause, and artifact-validation logic, extracted from the main engine loop.</purpose>
<non-goals>
  <item>Does not drive the main step iteration loop (see pipeline-engine.ts).</item>
  <item>Does not select which steps to run or manage phase transitions.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Extracted from pipeline-engine.ts to keep the engine under 300 lines and make retry logic independently testable.</item>
</CHANGE_SUMMARY>
*/

import { PipelinePauseError } from "./errors/pipeline-pause-error.js";
import type {
  PipelineEventCallback,
  PipelineExecutionGuide,
  PipelineStepContext,
  PipelineStepGuide,
  PipelineStepLike,
  PipelineArtifacts,
} from "./pipeline-types.js";
import {
  appendJsonLine,
  backupInvalidOutputArtifact,
  buildPauseContext,
  classifyArtifactValidationError,
  getErrorMessage,
} from "./pipeline-engine-helpers.js";

/**
 * Advances the current phase stack after a step completes.
 * Removes phases whose last selected step was the one just completed.
 *
 * This is a pure function — it does not mutate the input array but returns
 * a new filtered array.
 */
export const advancePhasesAfterStep = (options: {
  guide?: PipelineExecutionGuide;
  stepId: string;
  selectedStepIds: Set<string>;
  currentPhaseIds: string[];
}): string[] => {
  const { guide, stepId, selectedStepIds, currentPhaseIds } = options;
  if (!guide) {
    return currentPhaseIds;
  }

  return currentPhaseIds.filter((phaseId) => {
    const phase = guide.phases.find((candidate) => candidate.id === phaseId);
    if (!phase) {
      return false;
    }

    const lastSelectedStepId = phase.stepIds
      .filter((candidateStepId) => selectedStepIds.has(candidateStepId))
      .at(-1);

    return lastSelectedStepId !== stepId;
  });
};

/**
 * Runs a single step with the full retry/pause/validation lifecycle.
 *
 * Flow:
 *  1. Emit step_started, write log.txt entry.
 *  2. Run the step (attempt 1).
 *  3. Validate all artifacts.
 *  4. On success → emit step_completed, return.
 *  5. On failure:
 *     - If PipelinePauseError → emit pipeline_paused, rethrow.
 *     - If upstream artifact error → emit pipeline_paused, throw PipelinePauseError.
 *     - If own artifact error and retryPolicy="none" → emit pipeline_paused, throw.
 *     - If own artifact error and retryPolicy="on_output_invalid" → backup, retry (attempt 2).
 *  6. On retry failure → backup, emit pipeline_paused, throw PipelinePauseError.
 */
export const runStepWithRetry = async <
  TState,
  TContext extends PipelineStepContext<TState>,
  TStep extends PipelineStepLike<TContext>,
>(options: {
  step: TStep;
  ctx: TContext;
  emit?: PipelineEventCallback;
  stepGuideTitle: (stepId: string) => string;
  assertAllArtifactsValid: (stepId: string) => Promise<void>;
  stepGuidesById: Map<string, PipelineStepGuide | undefined>;
  stepArtifactsById: Map<string, PipelineArtifacts<TContext>>;
}): Promise<void> => {
  const {
    step,
    ctx,
    emit,
    stepGuideTitle,
    assertAllArtifactsValid,
    stepGuidesById,
    stepArtifactsById,
  } = options;

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

    // PipelinePauseError — pause immediately, no retry
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

    // Non-artifact error — rethrow as-is
    if (!artifactError) {
      throw error;
    }

    // Upstream artifact error — pause with upstream context
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

    // Own artifact error, no retry — pause
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

    // Own artifact error, retry allowed — backup and retry
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

      // PipelinePauseError on retry — pause immediately
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

      // Non-artifact error on retry — rethrow as-is
      if (!artifactError2 || artifactError2.ownerStepId !== step.id) {
        throw error2;
      }

      // Own artifact error on retry — pause (failed twice)
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
  }
};
