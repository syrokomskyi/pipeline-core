/*
<MODULE_CONTRACT>
<purpose>Defines types and interfaces for constructing and managing pipeline execution guides, steps, and phases.</purpose>
<non-goals>
  <item>Does not execute or manage the actual pipeline processes.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Initial definition of pipeline-related TypeScript types and interfaces.</item>
  <item>Added optional run namespace metadata for durable control-plane attempts.</item>
  <item>Added PipelineEvent and PipelineEventCallback types for onEvent callback in runPipelineEngine.</item>
  <item>Extended PipelineStepDecisionType with human_provides_content and human_reviews for messenger-driven pause handling.</item>
  <item>Enriched pipeline_paused PipelineEvent with pauseType, message, declarationText, availableArtifacts, and requiredFiles for agent-driven pause interaction.</item>
</CHANGE_SUMMARY>
*/

export type PipelineRetryPolicy = "none" | "on_output_invalid";

export type PipelineReusePolicy = "reuse_valid_artifacts" | "always_run";

export type PipelineStepDecisionType =
  "auto" | "human_confirms" | "human_provides_content" | "human_reviews" | "client_chooses";

export type PipelineStepAiModelUsage = {
  modelSource: string;
  modelId?: string;
  maxTokens?: number;
  purpose: string;
};

export type PipelineStepGuideSeed = {
  title: string;
  purpose: string;
  inputs: string[];
  outputs?: string[];
  definitionOfDone?: string[];
  decisionType?: PipelineStepDecisionType;
  nextStep?: string;
  notes?: string[];
  aiModelUsage?: PipelineStepAiModelUsage[];
};

export type PipelineStepGuide = {
  title: string;
  purpose: string;
  inputs: string[];
  outputs: string[];
  definitionOfDone: string[];
  decisionType: PipelineStepDecisionType;
  nextStep?: string;
  notes?: string[];
  phaseId?: string;
  aiModelUsage?: PipelineStepAiModelUsage[];
};

export type PipelinePhaseGuideSeed = {
  title: string;
  purpose: string;
  entryCriteria?: string[];
  exitCriteria?: string[];
  successSignals?: string[];
};

export type PipelinePhaseGuide = {
  id: string;
  title: string;
  purpose: string;
  stepIds: string[];
  directStepIds?: string[];
  childPhaseIds?: string[];
  parentPhaseId?: string;
  depth?: number;
  entryCriteria?: string[];
  exitCriteria?: string[];
  successSignals?: string[];
};

export type PipelineExecutionGuide = {
  title: string;
  summary: string;
  phases: PipelinePhaseGuide[];
  quickStart?: string[];
  operatingRules?: string[];
};

export type PipelineRunOptions = {
  dryRun?: boolean;
  force?: string[];
  from?: string;
  only?: string[];
  to?: string;
};

export type PipelineRunNamespace = {
  workRequestId?: string;
  attemptId?: string;
  batchId?: string;
  outputRootDir: string;
  lockedInputs: Record<string, string>;
  workerProfile?: string;
  reuseSource?: "local_artifacts" | "locked_artifact_refs";
};

export type TokenUsage = {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
};

export type PipelineAiLogOptions = {
  system?: string;
  userPrompts: string[];
  images?: Buffer[];
  responses?: Array<{
    content: string;
    fileName?: string;
  }>;
  data?: Array<{ buffer: Buffer; extension: string }>;
  llm?: {
    provider: string;
    model: string;
    version?: string;
    parameters?: Record<string, unknown>;
  };
  usage?: TokenUsage;
};

export type PipelineExplainContext<TStep extends PipelineStepLike<any> = PipelineStepLike<any>> = {
  steps: TStep[];
  phases: PipelinePhaseLike<any>[];
  findStep: (stepId: string) => TStep | null;
  findPhase: (phaseId: string) => PipelinePhaseLike<any> | null;
  getStepNumber: (stepId: string) => number | undefined;
  getPreviousStep: (stepId: string) => TStep | null;
  getNextStep: (stepId: string) => TStep | null;
  getPhaseStackForStep: (stepId: string) => PipelinePhaseLike<any>[];
  getPhaseForStep: (stepId: string) => PipelinePhaseLike<any> | null;
};

export type PipelineStepGuideFactory<TStep extends PipelineStepLike<any> = PipelineStepLike<any>> =
  (context: PipelineExplainContext<TStep>) => PipelineStepGuideSeed;

export type PipelinePhaseGuideFactory<TStep extends PipelineStepLike<any> = PipelineStepLike<any>> =
  (context: PipelineExplainContext<TStep>) => PipelinePhaseGuideSeed;

export type PipelineStepContext<TState = unknown> = {
  state: TState;
  currentStepId: string | null;
  runNamespace: PipelineRunNamespace;
  getPipelineOutputDir: () => string;
  getStepNumber: (stepId: string) => number;
  getStepOutputDir: (stepId: string) => string;
  getOutputPath: (stepId: string, baseFileName: string) => string;
  getStepArtifactPath: (stepId: string, artifactId: string) => string;
  ensureOutputDir: (dirPath: string) => Promise<void>;
  fileExists: (filePath: string) => Promise<boolean>;
  assertStepArtifactValid: (stepId: string, artifactId: string) => Promise<void>;
  logStepEvent: (event: {
    event: string;
    stepId?: string;
    attempt?: number;
    status?: string;
    operation?: string;
    provider?: string;
    model?: string;
    artifactId?: string;
    allowCreateStepOutputDir?: boolean;
    details?: Record<string, unknown>;
  }) => Promise<void>;
};

export type PipelineArtifact<TContext extends PipelineStepContext = PipelineStepContext> = {
  relativePath: string;
  kind: "file" | "dir";
  optional?: boolean;
  text?: {
    minLength?: number;
  };
  validate?: (options: { ctx: TContext; absolutePath: string }) => Promise<void>;
};

export type PipelineArtifacts<TContext extends PipelineStepContext = PipelineStepContext> = Record<
  string,
  PipelineArtifact<TContext>
>;

export type PipelinePhaseLike<TStep extends PipelineStepLike<any> = PipelineStepLike<any>> = {
  id: string;
  members: Array<TStep | PipelinePhaseLike<any>>;
  getSteps: () => TStep[];
  getPhases: () => PipelinePhaseLike<any>[];
  explainPhase: (context: PipelineExplainContext<TStep>) => PipelinePhaseGuideSeed;
};

export type PipelineStepLike<TContext extends PipelineStepContext<any> = PipelineStepContext<any>> =
  {
    id: string;
    artifacts: PipelineArtifacts<any>;
    guide?: PipelineStepGuide;
    explainStep?(context: PipelineExplainContext<PipelineStepLike<any>>): PipelineStepGuideSeed;
    getPromptFileNames?(): string[];
    shouldSkip?(ctx: TContext): boolean | Promise<boolean>;
    getActiveArtifactIds?(ctx: TContext): string[] | Promise<string[]>;
    validateBeforeStart?(ctx: TContext): Promise<void>;
    hydrateFromArtifacts?(ctx: TContext): Promise<void>;
    retryPolicy: PipelineRetryPolicy;
    reusePolicy: PipelineReusePolicy;
    run(ctx: TContext): Promise<void>;
  };

export type PipelineDefinition<TStep extends PipelineStepLike<any> = PipelineStepLike<any>> = {
  title: string;
  summary: string;
  quickStart?: string[];
  operatingRules?: string[];
  phases: PipelinePhaseLike<any>[];
  steps: TStep[];
};

export type CreatePipelineContextOptions<TState, TContext extends PipelineStepContext<TState>> = {
  stepArtifactsById: Map<string, PipelineArtifacts<TContext>>;
  stepNumbers: Map<string, number>;
  runNamespace: PipelineRunNamespace;
  state: TState;
};

export type PipelineContextFactory<TState, TContext extends PipelineStepContext<TState>> = (
  options: CreatePipelineContextOptions<TState, TContext>,
) => TContext;

export type PipelineEvent =
  | { type: "pipeline_started"; totalSteps: number }
  | {
      type: "step_started";
      stepId: string;
      stepNumber: number;
      title: string;
    }
  | {
      type: "step_completed";
      stepId: string;
      stepNumber: number;
    }
  | {
      type: "step_failed";
      stepId: string;
      stepNumber: number;
      error: string;
    }
  | {
      type: "step_skipped";
      stepId: string;
      stepNumber: number;
      reason: string;
    }
  | { type: "pipeline_completed" }
  | {
      type: "pipeline_paused";
      reason: string;
      stepId?: string;
      pauseType?: PipelineStepDecisionType;
      message?: string;
      declarationText?: string;
      availableArtifacts?: string[];
      requiredFiles?: string[];
    };

export type PipelineEventCallback = (event: PipelineEvent) => void;
