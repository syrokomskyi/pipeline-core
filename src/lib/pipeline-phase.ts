/*
<MODULE_CONTRACT>
<purpose>Defines and manages a pipeline phase, organizing steps and phases for execution.</purpose>
<non-goals>
  <item>Does not execute the pipeline steps.</item>
  <item>Does not handle error management within pipeline phases.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Initial implementation of the PipelinePhase class and related types.</item>
</CHANGE_SUMMARY>
*/

import type {
  PipelineExplainContext,
  PipelinePhaseGuideFactory,
  PipelinePhaseGuideSeed,
  PipelinePhaseLike,
  PipelineStepLike,
} from "./pipeline-types.js";

export type PipelinePhaseMember<TStep extends PipelineStepLike = PipelineStepLike> =
  | TStep
  | PipelinePhase<TStep>;

export type PipelinePhaseOptions<TStep extends PipelineStepLike = PipelineStepLike> = {
  id: string;
  members: Array<PipelinePhaseMember<TStep>>;
  explain: PipelinePhaseGuideSeed | PipelinePhaseGuideFactory<TStep>;
};

export class PipelinePhase<
  TStep extends PipelineStepLike = PipelineStepLike,
> implements PipelinePhaseLike<TStep> {
  readonly id: string;

  readonly members: Array<PipelinePhaseMember<TStep>>;

  readonly #explain: PipelinePhaseGuideSeed | PipelinePhaseGuideFactory<TStep>;

  constructor(options: PipelinePhaseOptions<TStep>) {
    this.id = options.id;
    this.members = options.members;
    this.#explain = options.explain;
  }

  getSteps(): TStep[] {
    return this.members.flatMap((member) => {
      return member instanceof PipelinePhase ? member.getSteps() : [member];
    });
  }

  getPhases(): Array<PipelinePhase<TStep>> {
    return [
      this,
      ...this.members.flatMap((member) => {
        return member instanceof PipelinePhase ? member.getPhases() : [];
      }),
    ];
  }

  explainPhase(context: PipelineExplainContext<TStep>): PipelinePhaseGuideSeed {
    return typeof this.#explain === "function" ? this.#explain(context) : this.#explain;
  }
}

export { PipelinePhase as Phase };
