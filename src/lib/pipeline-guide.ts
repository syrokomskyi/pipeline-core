/*
<MODULE_CONTRACT>
<purpose>Generates and formats comprehensive documentation for pipeline execution guides and phases.</purpose>
<non-goals>
  <item>Does not execute or manage pipeline steps.</item>
  <item>Does not validate pipeline configurations.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Initial implementation of pipeline documentation rendering functions.</item>
</CHANGE_SUMMARY>
*/

import type {
  PipelineDefinition,
  PipelineExplainContext,
  PipelinePhaseLike,
  PipelineExecutionGuide,
  PipelinePhaseGuide,
  PipelineStepAiModelUsage,
  PipelineStepDecisionType,
  PipelineStepGuide,
  PipelineStepGuideSeed,
  PipelineStepLike,
} from "./pipeline-types.js";

const decisionTypeLabels = {
  auto: "Auto",
  human_confirms: "Human confirms",
  human_provides_content: "Human provides content",
  human_reviews: "Human reviews",
  client_chooses: "Client chooses",
} satisfies Record<PipelineStepDecisionType, string>;

const createSection = (title: string, items: string[]): string[] => {
  if (items.length === 0) {
    return [];
  }

  return [`## ${title}`, "", ...items.map((item) => `- ${item}`), ""];
};

const trimTrailingEmptyLines = (lines: string[]): string => {
  const next = [...lines];

  while (next.length > 0 && next.at(-1) === "") {
    next.pop();
  }

  return next.join("\n");
};

const stripLeadingHeading = (markdown: string): string[] => {
  const lines = markdown.split("\n");
  const [, ...rest] = lines;

  while (rest.length > 0 && rest[0] === "") {
    rest.shift();
  }

  return rest;
};

const renderPipelineRouteLines = (options: {
  guide: PipelineExecutionGuide;
  stepNumbers: Map<string, number>;
  stepGuidesById: Map<string, PipelineStepGuide | undefined>;
}): string[] => {
  return options.guide.phases
    .filter((phase) => !phase.parentPhaseId)
    .flatMap((phase) => {
      const renderPhase = (currentPhase: PipelinePhaseGuide): string[] => {
        const phaseStepNumbers = currentPhase.stepIds
          .map((stepId) => options.stepNumbers.get(stepId))
          .filter((value): value is number => value !== undefined);
        const firstStepNumber = phaseStepNumbers[0];
        const lastStepNumber = phaseStepNumbers.at(-1);
        const rangeLabel =
          firstStepNumber && lastStepNumber
            ? firstStepNumber === lastStepNumber
              ? `Step ${firstStepNumber}`
              : `Steps ${firstStepNumber}-${lastStepNumber}`
            : "Unnumbered";
        const stepLabels = (currentPhase.directStepIds ?? currentPhase.stepIds).map((stepId) => {
          const stepGuide = options.stepGuidesById.get(stepId);
          const stepNumber = options.stepNumbers.get(stepId);
          const stepTitle = stepGuide?.title ?? stepId;
          return `${stepNumber ?? "?"}. ${stepTitle} \`${stepId}\``;
        });
        const childPhaseLines = (currentPhase.childPhaseIds ?? []).flatMap((childPhaseId) => {
          const childPhase = options.guide.phases.find((phase) => phase.id === childPhaseId);
          return childPhase ? renderPhase(childPhase) : [];
        });
        const depth = currentPhase.depth ?? 0;
        const headingPrefix = "#".repeat(Math.min(6, depth + 3));

        return [
          `${headingPrefix} ${currentPhase.title} (${rangeLabel})`,
          "",
          currentPhase.purpose,
          "",
          ...stepLabels.map((label) => `- ${label}`),
          "",
          ...childPhaseLines,
        ];
      };

      return renderPhase(phase);
    });
};

export const formatPipelineStepDecisionType = (decisionType: PipelineStepDecisionType): string => {
  return decisionTypeLabels[decisionType];
};

const createArtifactOutputs = (step: PipelineStepLike): string[] => {
  return Object.entries(step.artifacts).map(([artifactId, artifact]) => {
    const kind = artifact.kind === "dir" ? "Directory" : "File";
    return `${kind} \`${artifact.relativePath}\` for artifact \`${artifactId}\``;
  });
};

const createDefaultDefinitionOfDone = (
  step: PipelineStepLike,
  decisionType: PipelineStepDecisionType,
): string[] => {
  if (decisionType !== "auto") {
    return [
      "The human gate requirements are satisfied in this step output directory.",
      "Rerunning the pipeline can continue from the next step without another pause.",
    ];
  }

  // decisionType === "auto"

  if (Object.keys(step.artifacts).length === 0) {
    return ["The step completes its operational goal without requiring persisted artifacts."];
  }

  return [
    "All declared artifacts exist in the step output directory.",
    "The step finishes without validation errors and can be reused safely on rerun.",
  ];
};

const findPhaseStackForStep = <TStep extends PipelineStepLike>(
  phases: PipelinePhaseLike<any>[],
  stepId: string,
): PipelinePhaseLike<any>[] => {
  for (const phase of phases) {
    const directSteps = phase.members.filter((member): member is TStep => {
      return !("members" in member);
    });
    if (directSteps.some((step) => step.id === stepId)) {
      return [phase];
    }

    const childPhases = phase.members.filter((member): member is PipelinePhaseLike<any> => {
      return "members" in member;
    });
    const childStack = findPhaseStackForStep(childPhases, stepId);
    if (childStack.length > 0) {
      return [phase, ...childStack];
    }
  }

  return [];
};

export const createPipelineExplainContext = <TStep extends PipelineStepLike>(
  definition: PipelineDefinition<TStep>,
): PipelineExplainContext<TStep> => {
  const stepsById = new Map(definition.steps.map((step) => [step.id, step]));
  const phases = definition.phases.flatMap((phase) => phase.getPhases());
  const phasesById = new Map(phases.map((phase) => [phase.id, phase]));
  const stepNumbers = new Map(definition.steps.map((step, index) => [step.id, index + 1]));

  return {
    steps: definition.steps,
    phases,
    findStep: (stepId: string) => stepsById.get(stepId) ?? null,
    findPhase: (phaseId: string) => phasesById.get(phaseId) ?? null,
    getStepNumber: (stepId: string) => stepNumbers.get(stepId),
    getPreviousStep: (stepId: string) => {
      const currentIndex = definition.steps.findIndex((step) => step.id === stepId);
      return currentIndex > 0 ? (definition.steps[currentIndex - 1] ?? null) : null;
    },
    getNextStep: (stepId: string) => {
      const currentIndex = definition.steps.findIndex((step) => step.id === stepId);
      return currentIndex >= 0 ? (definition.steps[currentIndex + 1] ?? null) : null;
    },
    getPhaseStackForStep: (stepId: string) => findPhaseStackForStep(definition.phases, stepId),
    getPhaseForStep: (stepId: string) => {
      return findPhaseStackForStep(definition.phases, stepId).at(-1) ?? null;
    },
  };
};

const resolvePipelineStepGuide = <TStep extends PipelineStepLike>(
  step: TStep,
  context: PipelineExplainContext<TStep>,
): PipelineStepGuide => {
  const seed: PipelineStepGuideSeed = step.explainStep
    ? step.explainStep(context as PipelineExplainContext<PipelineStepLike>)
    : {
        title: step.id,
        purpose: `Run the operational step \`${step.id}\`.`,
        inputs: ["Validated upstream pipeline state and artifacts"],
      };
  const nextStep = context.getNextStep(step.id);
  const decisionType = seed.decisionType ?? "auto";

  return {
    title: seed.title,
    purpose: seed.purpose,
    inputs: seed.inputs,
    outputs: seed.outputs ?? createArtifactOutputs(step),
    definitionOfDone: seed.definitionOfDone ?? createDefaultDefinitionOfDone(step, decisionType),
    decisionType,
    nextStep:
      seed.nextStep ??
      (nextStep
        ? `${resolvePipelineStepGuide(nextStep, context).title} (\`${nextStep.id}\`)`
        : "Pipeline complete"),
    notes: seed.notes,
    phaseId: context.getPhaseForStep(step.id)?.id,
    aiModelUsage: seed.aiModelUsage,
  };
};

export const createPipelineExecutionGuide = <TStep extends PipelineStepLike>(
  definition: PipelineDefinition<TStep>,
): PipelineExecutionGuide => {
  const context = createPipelineExplainContext(definition);

  for (const step of definition.steps) {
    step.guide = resolvePipelineStepGuide(step, context);
  }

  const flattenedPhases = definition.phases.flatMap((phase) => phase.getPhases());
  const phaseGuides: PipelinePhaseGuide[] = flattenedPhases.map((phase) => {
    const seed = phase.explainPhase(context);
    const directStepIds = phase.members
      .filter((member): member is TStep => !("members" in member))
      .map((step) => step.id);
    const childPhases = phase.members.filter(
      (member): member is PipelinePhaseLike<any> => "members" in member,
    );
    const childPhaseIds = childPhases.map((childPhase) => childPhase.id);
    const stepIds = phase.getSteps().map((step) => step.id);
    const parentPhaseId = context.phases.find((candidate) => {
      return candidate.members.some((member) => "members" in member && member.id === phase.id);
    })?.id;
    const depth = context
      .getPhaseStackForStep(stepIds[0] ?? "")
      .findIndex((candidate) => candidate.id === phase.id);

    return {
      id: phase.id,
      title: seed.title,
      purpose: seed.purpose,
      stepIds,
      directStepIds,
      childPhaseIds,
      parentPhaseId,
      depth: depth >= 0 ? depth : 0,
      entryCriteria: seed.entryCriteria,
      successSignals: seed.successSignals,
      exitCriteria: seed.exitCriteria,
    };
  });

  return {
    title: definition.title,
    summary: definition.summary,
    quickStart: definition.quickStart,
    operatingRules: definition.operatingRules,
    phases: phaseGuides,
  };
};

export const findPipelinePhaseByStepId = (
  guide: PipelineExecutionGuide | undefined,
  stepId: string,
): PipelinePhaseGuide | null => {
  if (!guide) {
    return null;
  }

  return (
    guide.phases
      .filter((phase) => phase.stepIds.includes(stepId))
      .sort((a, b) => (b.depth ?? 0) - (a.depth ?? 0))[0] ?? null
  );
};

const renderAiModelUsageSummaryTable = (options: {
  stepNumbers: Map<string, number>;
  stepGuidesById: Map<string, PipelineStepGuide | undefined>;
}): string[] => {
  const rows: string[] = [];
  const sortedStepIds = [...options.stepNumbers.entries()]
    .sort(([, a], [, b]) => a - b)
    .map(([stepId]) => stepId);

  for (const stepId of sortedStepIds) {
    const stepNumber = options.stepNumbers.get(stepId);
    const stepGuide = options.stepGuidesById.get(stepId);
    if (
      stepNumber === undefined ||
      !stepGuide?.aiModelUsage ||
      stepGuide.aiModelUsage.length === 0
    ) {
      continue;
    }

    for (const usage of stepGuide.aiModelUsage) {
      const stepLabel = `${stepNumber}. ${stepGuide.title}`;
      const maxTokens = usage.maxTokens !== undefined ? String(usage.maxTokens) : "—";
      const modelId = usage.modelId ? `\`${usage.modelId}\`` : "—";
      rows.push(
        `| ${stepLabel} | \`${usage.modelSource}\` | ${modelId} | ${maxTokens} | ${usage.purpose} |`,
      );
    }
  }

  if (rows.length === 0) {
    return [];
  }

  return [
    "## AI Model Usage Summary",
    "",
    "| Step | Source | Model ID | Max Tokens | Purpose |",
    "|------|--------|----------|-----------|---------|",
    ...rows,
    "",
  ];
};

export const renderPipelineExecutionGuideMarkdown = (options: {
  guide: PipelineExecutionGuide;
  stepNumbers: Map<string, number>;
  stepGuidesById: Map<string, PipelineStepGuide | undefined>;
}): string => {
  const phaseLines = renderPipelineRouteLines(options);
  const aiUsageLines = renderAiModelUsageSummaryTable(options);

  return trimTrailingEmptyLines([
    `# ${options.guide.title}`,
    "",
    options.guide.summary,
    "",
    ...createSection("Quick start", options.guide.quickStart ?? []),
    ...createSection("Operating rules", options.guide.operatingRules ?? []),
    "## Route",
    "",
    ...phaseLines,
    ...aiUsageLines,
  ]);
};

export const renderFullPipelineGuideMarkdown = (options: {
  guide: PipelineExecutionGuide;
  stepNumbers: Map<string, number>;
  stepGuidesById: Map<string, PipelineStepGuide | undefined>;
}): string => {
  const { guide, stepNumbers, stepGuidesById } = options;
  const topLevelPhases = guide.phases.filter((phase) => !phase.parentPhaseId);

  const phaseSections = guide.phases.flatMap((phase) => {
    const headingDepth = Math.min(6, (phase.depth ?? 0) + 2);
    const heading = `${"#".repeat(headingDepth)} Phase: ${phase.title}`;

    return [
      heading,
      "",
      ...stripLeadingHeading(
        renderPipelinePhaseGuideMarkdown({
          phase,
          stepNumbers,
          stepGuidesById,
        }),
      ),
      "",
    ];
  });

  const sortedStepIds = [...stepNumbers.entries()]
    .sort(([, a], [, b]) => a - b)
    .map(([stepId]) => stepId);

  const stepSections = sortedStepIds.flatMap((stepId) => {
    const stepNumber = stepNumbers.get(stepId);
    const stepGuide = stepGuidesById.get(stepId);
    if (stepNumber === undefined || !stepGuide) {
      return [];
    }

    const phase = findPipelinePhaseByStepId(guide, stepId);

    return [
      `## Step ${stepNumber}: ${stepGuide.title}`,
      "",
      ...stripLeadingHeading(
        renderPipelineStepGuideMarkdown({
          stepId,
          stepNumber,
          guide: stepGuide,
          phaseTitle: phase?.title,
        }),
      ),
      "",
    ];
  });

  const aiUsageLines = renderAiModelUsageSummaryTable(options);

  return trimTrailingEmptyLines([
    `# ${guide.title}`,
    "",
    guide.summary,
    "",
    ...createSection("Quick start", guide.quickStart ?? []),
    ...createSection("Operating rules", guide.operatingRules ?? []),
    "## Top-level phases",
    "",
    ...topLevelPhases.map((phase) => `- ${phase.title} \`${phase.id}\``),
    "",
    "## Route",
    "",
    ...renderPipelineRouteLines({ guide, stepNumbers, stepGuidesById }),
    "",
    "## Phase details",
    "",
    ...phaseSections,
    "## Step details",
    "",
    ...stepSections,
    "",
    ...aiUsageLines,
  ]);
};

export const renderPipelinePhaseGuideMarkdown = (options: {
  phase: PipelinePhaseGuide;
  stepNumbers: Map<string, number>;
  stepGuidesById: Map<string, PipelineStepGuide | undefined>;
}): string => {
  const stepLines = options.phase.stepIds.map((stepId) => {
    const stepNumber = options.stepNumbers.get(stepId);
    const stepGuide = options.stepGuidesById.get(stepId);
    return `${stepNumber ?? "?"}. ${stepGuide?.title ?? stepId} \`${stepId}\``;
  });

  return trimTrailingEmptyLines([
    `# ${options.phase.title}`,
    "",
    options.phase.purpose,
    "",
    ...createSection("Entry criteria", options.phase.entryCriteria ?? []),
    ...createSection("Steps", stepLines),
    ...createSection("Success signals", options.phase.successSignals ?? []),
    ...createSection("Exit criteria", options.phase.exitCriteria ?? []),
  ]);
};

const renderAiModelUsageSection = (usages: PipelineStepAiModelUsage[]): string[] => {
  if (usages.length === 0) {
    return [];
  }

  const rows = usages.map((usage) => {
    const maxTokens = usage.maxTokens !== undefined ? String(usage.maxTokens) : "—";
    const modelId = usage.modelId ? `\`${usage.modelId}\`` : "—";
    return `| \`${usage.modelSource}\` | ${modelId} | ${maxTokens} | ${usage.purpose} |`;
  });

  return [
    "## AI Model Usage",
    "",
    "| Source | Model ID | Max Tokens | Purpose |",
    "|--------|----------|-----------|---------|",
    ...rows,
    "",
  ];
};

export const renderPipelineStepGuideMarkdown = (options: {
  stepId: string;
  stepNumber: number;
  guide: PipelineStepGuide;
  phaseTitle?: string;
}): string => {
  return trimTrailingEmptyLines([
    `# Step ${options.stepNumber}: ${options.guide.title}`,
    "",
    `- **Step ID:** \`${options.stepId}\``,
    `- **Decision type:** ${formatPipelineStepDecisionType(options.guide.decisionType)}`,
    `- **Phase:** ${options.phaseTitle ?? options.guide.phaseId ?? "Unassigned"}`,
    "",
    "## Why this step exists",
    "",
    options.guide.purpose,
    "",
    ...createSection("Inputs", options.guide.inputs),
    ...createSection("Outputs", options.guide.outputs),
    ...createSection("Definition of Done", options.guide.definitionOfDone),
    ...renderAiModelUsageSection(options.guide.aiModelUsage ?? []),
    ...createSection("Notes", options.guide.notes ?? []),
    ...createSection("Next step", options.guide.nextStep ? [options.guide.nextStep] : []),
  ]);
};

export const renderFullPipelineDocumentationMarkdown = <TStep extends PipelineStepLike>(
  definition: PipelineDefinition<TStep>,
): string => {
  const guide = createPipelineExecutionGuide(definition);
  const stepNumbers = new Map<string, number>(
    definition.steps.map((step, index) => [step.id, index + 1]),
  );
  const stepGuidesById = new Map<string, PipelineStepGuide | undefined>(
    definition.steps.map((step) => [step.id, step.guide]),
  );
  const topLevelPhases = guide.phases.filter((phase) => !phase.parentPhaseId);
  const phaseSections = guide.phases.flatMap((phase) => {
    const headingDepth = Math.min(6, (phase.depth ?? 0) + 2);
    const heading = `${"#".repeat(headingDepth)} Phase: ${phase.title}`;

    return [
      heading,
      "",
      ...stripLeadingHeading(
        renderPipelinePhaseGuideMarkdown({
          phase,
          stepNumbers,
          stepGuidesById,
        }),
      ),
      "",
    ];
  });
  const stepSections = definition.steps.flatMap((step) => {
    const stepNumber = stepNumbers.get(step.id);
    const stepGuide = step.guide;
    if (stepNumber === undefined || !stepGuide) {
      return [];
    }

    const phase = findPipelinePhaseByStepId(guide, step.id);

    return [
      `## Step ${stepNumber}: ${stepGuide.title}`,
      "",
      ...stripLeadingHeading(
        renderPipelineStepGuideMarkdown({
          stepId: step.id,
          stepNumber,
          guide: stepGuide,
          phaseTitle: phase?.title,
        }),
      ),
      "",
    ];
  });

  return trimTrailingEmptyLines([
    `# ${guide.title}`,
    "",
    guide.summary,
    "",
    ...createSection("Quick start", guide.quickStart ?? []),
    ...createSection("Operating rules", guide.operatingRules ?? []),
    "## Top-level phases",
    "",
    ...topLevelPhases.map((phase) => `- ${phase.title} \`${phase.id}\``),
    "",
    "## Route",
    "",
    ...renderPipelineRouteLines({
      guide,
      stepNumbers,
      stepGuidesById,
    }),
    "",
    "## Phase details",
    "",
    ...phaseSections,
    "## Step details",
    "",
    ...stepSections,
  ]);
};
