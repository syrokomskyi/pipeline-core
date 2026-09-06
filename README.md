# @warpgogol/pipeline-core

[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](LICENSE) [![npm](https://img.shields.io/npm/v/@warpgogol/pipeline-core?logo=npm&logoColor=white)](https://www.npmjs.com/package/@warpgogol/pipeline-core)

Declarative pipeline framework — define multi-step workflows with phases, steps, human gates, artifact validation, and lifecycle events.

> Engineered at [Warpgogol](https://warpgogol.com) · Released as open source.

---

## Features

- **Declarative pipeline definition** — compose phases and steps via `definePipeline()`
- **Phase-based routing** — group steps into ordered phases with metadata
- **Step contracts** — `PipelineStep<TContext>` base class with `validateBeforeStart`, `run`, `guide`
- **Lifecycle events** — `onEvent` callback for `pipeline_started`, `step_started`, `step_completed`, `pipeline_completed`
- **Human gates** — `PausePipelineStep` and `WaitHumanStep` for manual approval flows
- **Artifact validation** — fail-fast when prerequisites are missing or invalid
- **Guide generation** — auto-generate execution guides from declaration metadata
- **JSON logging** — structured `JsonLogger` for machine-readable output
- **Console formatting** — `formatPipelineStart`, `formatPipelineOverview`, `formatPipelineFinished`
- **Validator composition** — `composeValidators()` for reusable validation logic
- **Zero runtime dependencies** — only `tslib`

## Install

```bash
npm install @warpgogol/pipeline-core
```

## Quick start

```ts
import {
  definePipeline,
  PipelineStep,
  PipelinePhase,
  runPipelineEngine,
} from "@warpgogol/pipeline-core";

// 1. Define a step
class HelloStep extends PipelineStep {
  readonly id = "hello";
  readonly executionSemantics = "pure_artifact" as const;

  async run(ctx) {
    console.log("Hello from step!");
  }
}

// 2. Define a phase
const phase: PipelinePhase = {
  id: "greeting",
  title: "Greeting Phase",
  members: [{ stepId: "hello", factory: () => new HelloStep() }],
};

// 3. Assemble and run
const pipeline = definePipeline({
  id: "my-pipeline",
  phases: [phase],
});

await runPipelineEngine(pipeline, context);
```

## Exports

| Export                             | Description                                  |
| ---------------------------------- | -------------------------------------------- |
| `definePipeline(config)`           | Assemble a pipeline from phases and metadata |
| `runPipelineEngine(pipeline, ctx)` | Execute a pipeline with lifecycle events     |
| `PipelineStep<TContext>`           | Base class for pipeline steps                |
| `PipelinePhase`                    | Phase definition with ordered members        |
| `PipelineGogol`                    | Extended step base with guide metadata       |
| `Phase`                            | Phase registry helper                        |
| `PausePipelineStep`                | Step that pauses for manual approval         |
| `WaitHumanStep`                    | Step that waits for human input              |
| `PipelinePauseError`               | Error thrown when a step pauses              |
| `ArtifactValidationError`          | Error for invalid artifacts                  |
| `composeValidators(validators)`    | Compose multiple validators into one         |
| `JsonLogger`                       | Structured JSON line logger                  |
| `formatPipelineStart(pipeline)`    | Console formatting helper                    |
| `formatPipelineOverview(pipeline)` | Console formatting helper                    |
| `formatPipelineFinished(pipeline)` | Console formatting helper                    |
| `PipelineEvent`                    | Event type for lifecycle callbacks           |
| `PipelineEventCallback`            | Callback type for lifecycle events           |
| `PIPELINE_CONST`                   | Shared pipeline constants                    |

### Subpath exports

| Path                             | Description               |
| -------------------------------- | ------------------------- |
| `@warpgogol/pipeline-core/phase` | Phase types and helpers   |
| `@warpgogol/pipeline-core/step`  | Step types and base class |

## Changelog

[CHANGELOG.md](CHANGELOG.md)

## License

Apache-2.0 — see [LICENSE](LICENSE)

## Open Engineering

This package originated from production engineering work at [Warpgogol](https://warpgogol.com), an engineering studio in Germany.

We publish reusable parts of our infrastructure when they can be useful beyond our own projects. It is published independently of any Warpgogol commercial service. Using this package does not create any dependency on Warpgogol.

Built for real systems. Shared openly.
