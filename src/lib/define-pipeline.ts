/*
<MODULE_CONTRACT>
<purpose>Defines a structured pipeline by organizing phases and steps for streamlined execution.</purpose>
<non-goals>
  <item>Does not execute the pipeline or its steps.</item>
  <item>Does not validate the correctness of the pipeline phases or steps.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Initial implementation of pipeline definition function.</item>
</CHANGE_SUMMARY>
*/

import type { PipelinePhase } from "./pipeline-phase.js";
import type { PipelineDefinition, PipelineStepLike } from "./pipeline-types.js";

export const definePipeline = <TStep extends PipelineStepLike>(options: {
  title: string;
  summary: string;
  quickStart?: string[];
  operatingRules?: string[];
  phases: PipelinePhase<TStep>[];
}): PipelineDefinition<TStep> => {
  return {
    title: options.title,
    summary: options.summary,
    quickStart: options.quickStart,
    operatingRules: options.operatingRules,
    phases: options.phases,
    steps: options.phases.flatMap((phase) => phase.getSteps()),
  };
};
