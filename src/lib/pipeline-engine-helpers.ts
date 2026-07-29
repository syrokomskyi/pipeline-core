/*
<MODULE_CONTRACT>
<purpose>Internal helpers for the pipeline execution engine in @syrokomskyi/pipeline-core.</purpose>
<non-goals>
  <item>Does not drive the main step execution loop (see pipeline-engine.ts).</item>
  <item>Does not manage step state or artifact registries directly.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Extracted internal engine helpers from pipeline-engine.ts during file-size refactor.</item>
  <item>Added buildPauseContext helper to enrich pipeline_paused events with pauseType, declarationText, availableArtifacts, and requiredFiles for agent-driven pause interaction.</item>
</CHANGE_SUMMARY>
*/

import fs from "node:fs/promises";
import path from "node:path";

import { formatPhaseCompleted, formatStepGuide } from "./console-format.js";
import { ArtifactValidationError } from "./errors/artifact-validation-error.js";
import { PipelinePauseError } from "./errors/pipeline-pause-error.js";
import {
  findPipelinePhaseByStepId,
  renderFullPipelineGuideMarkdown,
  renderPipelineExecutionGuideMarkdown,
  renderPipelinePhaseGuideMarkdown,
  renderPipelineStepGuideMarkdown,
} from "./pipeline-guide.js";
import type {
  PipelineExecutionGuide,
  PipelineRunOptions,
  PipelineStepContext,
  PipelineStepGuide,
  PipelineStepLike,
} from "./pipeline-types.js";

export const buildSelectedStepIdSet = <TStep extends { id: string }>(options: {
  steps: TStep[];
  runOptions: PipelineRunOptions;
}): Set<string> => {
  const { steps, runOptions } = options;
  const allIds = steps.map((step) => step.id);

  const assertKnownId = (stepId: string) => {
    if (!allIds.includes(stepId)) {
      throw new Error(`Unknown pipeline step id in execution options: ${stepId}`);
    }
  };

  for (const stepId of runOptions.only ?? []) {
    assertKnownId(stepId);
  }

  if (runOptions.from) {
    assertKnownId(runOptions.from);
  }

  if (runOptions.to) {
    assertKnownId(runOptions.to);
  }

  if ((runOptions.only?.length ?? 0) > 0) {
    return new Set(runOptions.only);
  }

  const fromIndex = runOptions.from ? allIds.indexOf(runOptions.from) : 0;
  const toIndex = runOptions.to ? allIds.indexOf(runOptions.to) : allIds.length - 1;

  if (fromIndex > toIndex) {
    throw new Error(
      `Invalid execution range: from=${runOptions.from} is after to=${runOptions.to}`,
    );
  }

  return new Set(allIds.slice(fromIndex, toIndex + 1));
};

export const classifyArtifactValidationError = async (options: {
  assertAllArtifactsValid: (stepId: string) => Promise<void>;
  error: unknown;
  stepId: string;
}): Promise<ArtifactValidationError | null> => {
  if (options.error instanceof ArtifactValidationError) {
    return options.error;
  }

  try {
    await options.assertAllArtifactsValid(options.stepId);
    return null;
  } catch (validationError) {
    return validationError instanceof ArtifactValidationError ? validationError : null;
  }
};

export const getErrorMessage = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === "string") {
    return error;
  }

  return String(error);
};

/**
 * Builds enriched pause context for pipeline_paused events.
 * Extracts pauseType, declarationText, availableArtifacts, and requiredFiles
 * from the step's guide metadata and output directory.
 */
export const buildPauseContext = async (options: {
  stepId: string;
  reason: string;
  stepGuidesById: Map<string, PipelineStepGuide | undefined>;
  stepArtifactsById: Map<string, Record<string, { relativePath: string; kind: string }>>;
  ctx: PipelineStepContext;
}): Promise<{
  pauseType: PipelineStepGuide["decisionType"];
  message: string;
  declarationText: string;
  availableArtifacts: string[];
  requiredFiles: string[];
}> => {
  const { stepId, reason, stepGuidesById, stepArtifactsById, ctx } = options;

  const guide = stepGuidesById.get(stepId);
  const artifacts = stepArtifactsById.get(stepId) ?? {};

  const pauseType = guide?.decisionType ?? "auto";
  const requiredFiles = Object.values(artifacts).map((a) => a.relativePath);

  const declarationText = guide
    ? [
        `# ${guide.title}`,
        "",
        `## Purpose`,
        guide.purpose,
        "",
        "## Definition of Done",
        ...guide.definitionOfDone.map((d) => `- ${d}`),
        ...(guide.notes?.length ? ["", "## Notes", ...guide.notes.map((n) => `- ${n}`)] : []),
      ].join("\n")
    : "";

  let availableArtifacts: string[] = [];
  try {
    const outputDir = ctx.getStepOutputDir(stepId);
    const entries = await fs.readdir(outputDir);
    availableArtifacts = entries.filter((entry) => !entry.startsWith("."));
  } catch {
    // Output directory may not exist yet (e.g. pause in validateBeforeStart)
  }

  return {
    pauseType,
    message: reason,
    declarationText,
    availableArtifacts,
    requiredFiles,
  };
};

export const appendJsonLine = async (filePath: string, payload: Record<string, unknown>) => {
  await fs.appendFile(filePath, `${JSON.stringify(payload)}\n`, "utf-8");
};

export const sanitizeFileSegment = (value: string): string => {
  return value
    .replaceAll(/[^a-z0-9-]+/gi, "-")
    .replaceAll(/-+/g, "-")
    .replaceAll(/^-|-$/g, "");
};

export const writeTextFileEnsured = async (filePath: string, content: string) => {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, content, "utf-8");
};

const hasPromptPlaceholder = (text: string): boolean => {
  return /\b(?:TODO|TBD)\b/i.test(text);
};

type PromptAwarePipelineContext<TState> = PipelineStepContext<TState> & {
  promptsDir: string;
  readTextFile: (filePath: string) => Promise<string>;
};

const isPromptAwarePipelineContext = <TState, TContext extends PipelineStepContext<TState>>(
  ctx: TContext,
): ctx is TContext & PromptAwarePipelineContext<TState> => {
  return (
    typeof (ctx as Record<string, unknown>).promptsDir === "string" &&
    typeof (ctx as Record<string, unknown>).readTextFile === "function"
  );
};

export const assertStepPromptTemplateReady = async <
  TState,
  TContext extends PipelineStepContext<TState>,
>(options: {
  ctx: TContext;
  step: PipelineStepLike<TContext>;
}): Promise<void> => {
  const { ctx, step } = options;
  if (!isPromptAwarePipelineContext(ctx)) {
    return;
  }

  const promptFileNames = step.getPromptFileNames?.() ?? [`${step.id}.md`];

  for (const promptFileName of promptFileNames) {
    const promptPath = path.join(ctx.promptsDir, promptFileName);
    if (!(await ctx.fileExists(promptPath))) {
      continue;
    }

    const promptText = await ctx.readTextFile(promptPath);
    if (!hasPromptPlaceholder(promptText)) {
      continue;
    }

    throw new PipelinePauseError(
      [
        `Pipeline paused by ${step.id}.`,
        `Prompt template is not ready: ${path.basename(promptPath)}.`,
        "The prompt file still contains TODO or TBD placeholders.",
        `Create the prompt for gogol \`${step.id}\` and rerun.`,
      ].join("\n"),
    );
  }
};

const resolveModelSource = (modelSource: string, state: unknown): string | undefined => {
  const parts = modelSource.split(".");
  let current: unknown = state;
  for (const part of parts) {
    if (current === null || typeof current !== "object") {
      return undefined;
    }
    current = (current as Record<string, unknown>)[part];
  }
  if (typeof current === "string") {
    return current;
  }
  if (Array.isArray(current) && current.every((v) => typeof v === "string")) {
    return current.join(", ");
  }
  return undefined;
};

const enrichGuidesWithModelIds = (
  stepGuidesById: Map<string, PipelineStepGuide | undefined>,
  state: unknown,
): Map<string, PipelineStepGuide | undefined> => {
  const enriched = new Map<string, PipelineStepGuide | undefined>();
  for (const [stepId, guide] of stepGuidesById) {
    if (!guide?.aiModelUsage || guide.aiModelUsage.length === 0) {
      enriched.set(stepId, guide);
      continue;
    }
    enriched.set(stepId, {
      ...guide,
      aiModelUsage: guide.aiModelUsage.map((usage) => ({
        ...usage,
        modelId: usage.modelId ?? resolveModelSource(usage.modelSource, state),
      })),
    });
  }
  return enriched;
};

export const writeGuideArtifacts = async <
  TState,
  TContext extends PipelineStepContext<TState>,
>(options: {
  ctx: TContext;
  guide?: PipelineExecutionGuide;
  stepNumbers: Map<string, number>;
  stepGuidesById: Map<string, PipelineStepGuide | undefined>;
}): Promise<void> => {
  const { ctx, guide, stepNumbers, stepGuidesById } = options;
  if (!guide) {
    return;
  }

  const enrichedGuides = enrichGuidesWithModelIds(stepGuidesById, ctx.state);

  const guideDir = path.join(ctx.getPipelineOutputDir(), "_guide");
  await ctx.ensureOutputDir(guideDir);

  await writeTextFileEnsured(
    path.join(guideDir, "start-here.md"),
    renderPipelineExecutionGuideMarkdown({
      guide,
      stepNumbers,
      stepGuidesById: enrichedGuides,
    }),
  );

  await writeTextFileEnsured(
    path.join(guideDir, "all.md"),
    renderFullPipelineGuideMarkdown({
      guide,
      stepNumbers,
      stepGuidesById: enrichedGuides,
    }),
  );

  for (const [index, phase] of guide.phases.entries()) {
    await writeTextFileEnsured(
      path.join(guideDir, `${String(index).padStart(2, "0")}-${sanitizeFileSegment(phase.id)}.md`),
      renderPipelinePhaseGuideMarkdown({
        phase,
        stepNumbers,
        stepGuidesById: enrichedGuides,
      }),
    );
  }

  const stepsDir = path.join(guideDir, "steps");
  await ctx.ensureOutputDir(stepsDir);

  for (const phase of guide.phases) {
    for (const stepId of phase.stepIds) {
      const stepNumber = stepNumbers.get(stepId);
      const stepGuide = enrichedGuides.get(stepId);
      if (stepNumber === undefined || !stepGuide) {
        continue;
      }

      await writeTextFileEnsured(
        path.join(
          stepsDir,
          `${String(stepNumber).padStart(2, "0")}-${sanitizeFileSegment(stepId)}.md`,
        ),
        renderPipelineStepGuideMarkdown({
          stepId,
          stepNumber,
          guide: stepGuide,
          phaseTitle: phase.title,
        }),
      );
    }
  }
};

export const printStepGuide = <TState, TContext extends PipelineStepContext<TState>>(options: {
  steps: PipelineStepLike<TContext>[];
  stepId: string;
  stepNumbers: Map<string, number>;
  guide?: PipelineExecutionGuide;
}): void => {
  const { steps, stepId, stepNumbers, guide } = options;
  const step = steps.find((candidate) => candidate.id === stepId);
  if (!step?.guide || !guide) {
    return;
  }

  const stepNumber = stepNumbers.get(step.id);
  if (stepNumber === undefined) {
    return;
  }

  const phase = findPipelinePhaseByStepId(guide, step.id);
  console.log(
    formatStepGuide({
      stepId: step.id,
      stepNumber,
      guide: step.guide,
      phaseTitle: phase?.title,
    }),
  );
};

export const writeStepGuideArtifact = async <
  TState,
  TContext extends PipelineStepContext<TState>,
>(options: {
  ctx: TContext;
  steps: PipelineStepLike<TContext>[];
  stepId: string;
  stepNumbers: Map<string, number>;
  guide?: PipelineExecutionGuide;
}): Promise<void> => {
  const { ctx, steps, stepId, stepNumbers, guide } = options;
  const step = steps.find((s) => s.id === stepId);
  if (!step?.guide || !guide) {
    return;
  }

  const stepNumber = stepNumbers.get(step.id);
  if (stepNumber === undefined) {
    return;
  }

  const phase = findPipelinePhaseByStepId(guide, step.id);

  await writeTextFileEnsured(
    path.join(ctx.getStepOutputDir(step.id), "step-guide.md"),
    renderPipelineStepGuideMarkdown({
      stepId: step.id,
      stepNumber,
      guide: step.guide,
      phaseTitle: phase?.title,
    }),
  );
};

export const completePhaseIfNeeded = async <
  TContext extends PipelineStepContext<unknown>,
>(options: {
  ctx: TContext;
  guide?: PipelineExecutionGuide;
  selectedStepIds: Set<string>;
  stepId: string;
}): Promise<void> => {
  const { ctx, guide, selectedStepIds, stepId } = options;
  if (!guide) {
    return;
  }

  const phases = guide.phases
    .filter((phase) => phase.stepIds.includes(stepId))
    .sort((a, b) => (b.depth ?? 0) - (a.depth ?? 0));

  for (const phase of phases) {
    const lastSelectedStepId = phase.stepIds
      .filter((candidateStepId) => selectedStepIds.has(candidateStepId))
      .at(-1);

    if (lastSelectedStepId !== stepId) {
      continue;
    }

    console.log(formatPhaseCompleted(phase));
    await ctx.logStepEvent({
      event: "phase_completed",
      stepId,
      status: "completed",
      details: {
        phaseId: phase.id,
        phaseTitle: phase.title,
      },
    });
  }
};

export const backupInvalidOutputArtifact = async <
  TContext extends PipelineStepContext<unknown>,
>(options: {
  ctx: TContext;
  attempt: 1 | 2;
  artifactId: string;
  stepId: string;
}): Promise<void> => {
  const { ctx, attempt, artifactId, stepId } = options;
  const absolutePath = ctx.getStepArtifactPath(stepId, artifactId);
  const exists = await ctx.fileExists(absolutePath);
  if (!exists) {
    return;
  }

  const nextPath = `${absolutePath}.invalid-${attempt}`;

  try {
    await fs.rename(absolutePath, nextPath);
  } catch (error) {
    const isEperm = (error as NodeJS.ErrnoException).code === "EPERM";
    if (isEperm) {
      try {
        await fs.cp(absolutePath, nextPath, { recursive: true, force: true });
        await fs.rm(absolutePath, { recursive: true, force: true });
        return;
      } catch (copyError) {
        console.error(
          `Failed to backup invalid artifact ${stepId}:${artifactId} via copy+delete:`,
          copyError,
        );
        return;
      }
    }
    console.error(`Failed to backup invalid artifact ${stepId}:${artifactId}:`, error);
  }
};
