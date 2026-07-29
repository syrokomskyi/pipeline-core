/*
<MODULE_CONTRACT>
<purpose>Define and manage pipeline steps with customizable execution and explanation logic.</purpose>
<non-goals>
  <item>Does not execute the pipeline steps themselves.</item>
  <item>Does not handle pipeline orchestration or scheduling.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Initial implementation of the PipelineStep abstract class.</item>
</CHANGE_SUMMARY>
*/

import type {
  PipelineExplainContext,
  PipelineArtifacts,
  PipelineStepGuideFactory,
  PipelineStepGuideSeed,
  PipelineStepGuide,
  PipelineStepLike,
  PipelineReusePolicy,
  PipelineRetryPolicy,
  PipelineStepContext,
} from "./pipeline-types.js";

export abstract class PipelineStep<TContext extends PipelineStepContext = PipelineStepContext> {
  #explainStepOverride?:
    PipelineStepGuideSeed | PipelineStepGuideFactory<PipelineStepLike<TContext>>;

  abstract readonly id: string;

  readonly artifacts: PipelineArtifacts<TContext> = {};

  guide?: PipelineStepGuide;

  readonly retryPolicy: PipelineRetryPolicy = "on_output_invalid";

  readonly reusePolicy: PipelineReusePolicy = "reuse_valid_artifacts";

  /**
   * Optional list of step IDs to skip. When set, the engine calls
   * `shouldSkip` with this list; subclasses may override `getSkipIds`
   * for dynamic skip logic (e.g. reading from pipeline state).
   */
  skipStepIds?: string[];

  /**
   * Returns the list of step IDs that should be skipped for this run.
   * Override in subclasses to provide dynamic skip logic.
   * Defaults to `this.skipStepIds`.
   */
  getSkipIds(_ctx: TContext): string[] {
    return this.skipStepIds ?? [];
  }

  getArtifactPath(ctx: TContext, artifactId: string): string {
    return ctx.getStepArtifactPath(this.id, artifactId);
  }

  withExplanation(
    explanation: PipelineStepGuideSeed | PipelineStepGuideFactory<PipelineStepLike<TContext>>,
  ): this {
    this.#explainStepOverride = explanation;
    return this;
  }

  explainStep(context: PipelineExplainContext<PipelineStepLike<TContext>>): PipelineStepGuideSeed {
    if (this.#explainStepOverride) {
      return typeof this.#explainStepOverride === "function"
        ? this.#explainStepOverride(context)
        : this.#explainStepOverride;
    }

    return {
      title: this.id,
      purpose: `Run the operational step \`${this.id}\`.`,
      inputs: ["Validated upstream pipeline state and artifacts"],
    };
  }

  getPromptFileNames(): string[] {
    return [`${this.id}.md`];
  }

  async shouldSkip(ctx: TContext): Promise<boolean> {
    return this.getSkipIds(ctx).includes(this.id);
  }

  /**
   * Returns the IDs of artifacts that should be validated for this run.
   * Override in subclasses to exclude conditionally-declared artifacts
   * (e.g. artifacts that are only produced when a brief flag is enabled).
   * Defaults to all declared artifact IDs.
   */
  getActiveArtifactIds(_ctx: TContext): string[] {
    return Object.keys(this.artifacts);
  }

  async validateBeforeStart(ctx: TContext): Promise<void> {
    void ctx;
  }

  async hydrateFromArtifacts(ctx: TContext): Promise<void> {
    void ctx;
  }

  abstract run(ctx: TContext): Promise<void>;
}

export { PipelineStep as Gogol, PipelineStep as PipelineGogol };
