/*
<MODULE_CONTRACT>
<purpose>Formats and colorizes pipeline execution messages for terminal output, enhancing readability and clarity.</purpose>
<non-goals>
  <item>Does not execute or manage pipeline logic.</item>
  <item>Does not handle file I/O operations beyond path manipulation.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Initial implementation of terminal message formatting and colorization.</item>
</CHANGE_SUMMARY>
*/

import fs from "node:fs";
import path from "node:path";
import type {
  PipelineExecutionGuide,
  PipelinePhaseGuide,
  PipelineStepDecisionType,
  PipelineStepGuide,
} from "./pipeline-types.js";

const ANSI = {
  reset: "\u001B[0m",
  bold: "\u001B[1m",
  dim: "\u001B[2m",
  red: "\u001B[31m",
  green: "\u001B[32m",
  yellow: "\u001B[33m",
  blue: "\u001B[34m",
  magenta: "\u001B[35m",
  cyan: "\u001B[36m",
  white: "\u001B[37m",
  gray: "\u001B[90m",
  bgRed: "\u001B[41m",
  bgGreen: "\u001B[42m",
  bgBlue: "\u001B[44m",
  bgMagenta: "\u001B[45m",
  bgCyan: "\u001B[46m",
} as const;

const supportsColor = (): boolean => {
  if (process.env.NO_COLOR) {
    return false;
  }

  if (process.env.FORCE_COLOR) {
    return process.env.FORCE_COLOR !== "0";
  }

  return Boolean(process.stdout.isTTY);
};

const colorize = (code: string, value: string): string => {
  if (!supportsColor()) {
    return value;
  }

  return `${code}${value}${ANSI.reset}`;
};

const bold = (value: string): string => colorize(ANSI.bold, value);
const dim = (value: string): string => colorize(ANSI.dim, value);
const red = (value: string): string => colorize(ANSI.red, value);
const green = (value: string): string => colorize(ANSI.green, value);
const yellow = (value: string): string => colorize(ANSI.yellow, value);
const cyan = (value: string): string => colorize(ANSI.cyan, value);
const gray = (value: string): string => colorize(ANSI.gray, value);
const withBadge = (background: string, label: string): string => {
  return colorize(background + ANSI.white + ANSI.bold, ` ${label} `);
};

/**
 * Find the nearest `.git` directory walking up from the given start directory.
 * Returns `null` if none is found.
 */
const findGitRoot = (startDir: string): string | null => {
  let current = path.resolve(startDir);
  const root = path.parse(current).root;
  while (current !== root) {
    if (fs.existsSync(path.join(current, ".git"))) {
      return current;
    }
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return null;
};

/**
 * Convert an absolute path to a relative one based on the monorepo/git root.
 * Falls back to `process.cwd()` if no `.git` directory is found.
 * Normalizes back-slashes to forward slashes for cross-platform consistency.
 */
export const toRelativePath = (absolutePath: string): string => {
  const base = findGitRoot(process.cwd()) ?? process.cwd();
  let relative = path.relative(base, absolutePath);
  if (!relative || relative === ".") relative = ".";
  return relative.replace(/\\/g, "/");
};

const box = (title: string, lines: string[], tone: "info" | "success" | "warning" | "error") => {
  const color =
    tone === "success" ? green : tone === "warning" ? yellow : tone === "error" ? red : cyan;
  const top = color(`+-- ${title}`);
  const body = lines.map((line) => `${color("|")} ${line}`);
  const bottom = color("+----------------------------------------");

  return ["", top, ...body, bottom].join("\n");
};

const bulletList = (items: string[], tone: (value: string) => string = gray): string[] => {
  return items.map((item) => `  ${tone("-")} ${item}`);
};

const decisionTypeLabel = (decisionType: PipelineStepDecisionType): string => {
  switch (decisionType) {
    case "human_confirms":
      return "Human confirms";
    case "human_provides_content":
      return "Human provides content";
    case "human_reviews":
      return "Human reviews";
    case "client_chooses":
      return "Client chooses";
    default:
      return "Auto";
  }
};

export const formatPipelineStart = (options: {
  pipelineTitle?: string;
  outputDir?: string;
  inputDir?: string;
}): string => {
  const lines = [
    `${withBadge(ANSI.bgCyan, "PIPELINE")} ${bold(options.pipelineTitle ?? "Processing started")}`,
  ];

  if (options.inputDir) {
    lines.push(`${dim("Input:")} ${toRelativePath(options.inputDir)}`);
  }

  if (options.outputDir) {
    lines.push(`${dim("Output:")} ${toRelativePath(options.outputDir)}`);
  }

  return box("Run started", lines, "info");
};

export const formatPipelineFinished = (options: {
  pipelineTitle?: string;
  outputDir?: string;
}): string => {
  const lines = [
    `${withBadge(ANSI.bgGreen, "DONE")} ${bold(options.pipelineTitle ?? "Processing complete")}`,
  ];

  if (options.outputDir) {
    lines.push(`${dim("Artifacts:")} ${toRelativePath(options.outputDir)}`);
  }

  return box("Run finished", lines, "success");
};

export const formatDryRunSummary = (
  items: Array<{ stepId: string; outputDir: string }>,
): string => {
  return box(
    "Dry run",
    [
      bold("Selected steps"),
      ...items.map(
        (item) => `  ${cyan(item.stepId)} ${dim("→")} ${toRelativePath(item.outputDir)}`,
      ),
    ],
    "info",
  );
};

export const formatForceSummary = (stepIds: string[]): string => {
  return box("Forced steps", [stepIds.join(", ")], "warning");
};

export const formatSkippedStep = (stepId: string, reason: string): string => {
  return `${dim("skip:")} ${gray(stepId)} ${dim("-")} ${reason}`;
};

export const formatPhaseStart = (phase: PipelinePhaseGuide): string => {
  const lines = [`${withBadge(ANSI.bgBlue, phase.title.replace("Phase ", ""))}`, phase.purpose];

  if ((phase.entryCriteria?.length ?? 0) > 0) {
    lines.push("", `${dim("Entry criteria")}`);
    lines.push(...bulletList(phase.entryCriteria ?? []));
  }

  return box(`Phase ${phase.id}`, lines, "info");
};

export const formatPhaseCompleted = (phase: PipelinePhaseGuide): string => {
  return `${green("✓")} ${bold(phase.title)} ${dim("completed")}`;
};

export const formatStepGuide = (options: {
  stepId: string;
  stepNumber: number;
  guide: PipelineStepGuide;
  phaseTitle?: string;
}): string => {
  const decisionTone =
    options.guide.decisionType === "auto"
      ? withBadge(ANSI.bgGreen, decisionTypeLabel(options.guide.decisionType).toUpperCase())
      : withBadge(ANSI.bgMagenta, decisionTypeLabel(options.guide.decisionType).toUpperCase());

  const lines = [
    `${withBadge(ANSI.bgBlue, options.guide.title)}`,
    `${dim("ID:")} ${cyan(options.stepId)}    ${dim("Decision:")} ${decisionTone}`,
  ];

  if (options.phaseTitle) {
    lines.push(`${dim("Phase:")} ${options.phaseTitle.replace("Phase ", "")}`);
  }

  lines.push("", options.guide.purpose);
  lines.push("", bold("Inputs"), ...bulletList(options.guide.inputs));

  if (options.guide.outputs.length > 0) {
    lines.push("", bold("Outputs"), ...bulletList(options.guide.outputs));
  }

  if (options.guide.definitionOfDone.length > 0) {
    lines.push("", bold("Definition of done"), ...bulletList(options.guide.definitionOfDone));
  }

  if (options.guide.nextStep) {
    lines.push("", `${bold("Next")}: ${options.guide.nextStep}`);
  }

  if ((options.guide.notes?.length ?? 0) > 0) {
    lines.push("", bold("Notes"), ...bulletList(options.guide.notes ?? []));
  }

  return box(`Gogol ${options.stepNumber}`, lines, "info");
};

const classifyPauseLine = (line: string): string => {
  if (line.startsWith("Pipeline paused by ")) {
    return `${yellow("Paused by:")} ${bold(line.replace("Pipeline paused by ", "").replace(/\.$/, ""))}`;
  }

  if (line.startsWith("Missing required manual input in ")) {
    return `${red("Missing input:")} ${line.replace("Missing required manual input in ", "")}`;
  }

  if (line.startsWith("Expected at least one file with extensions:")) {
    return `${yellow("Expected files:")} ${line.replace("Expected at least one file with extensions:", "").trim()}`;
  }

  if (line.startsWith("Upstream: ")) {
    return `${yellow("Upstream:")} ${line.replace("Upstream: ", "")}`;
  }

  return line;
};

export const formatPipelinePaused = (message: string): string => {
  const lines = message
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map(classifyPauseLine);

  // Insert empty lines between logical groups
  const groupedLines: string[] = [];
  let currentGroup: string[] = [];
  const ansiEscapePattern = new RegExp(String.raw`\u001B\[\d+m`, "g");

  // Helper to remove ANSI escape codes to safely match strings
  const stripAnsi = (str: string) => str.replace(ansiEscapePattern, "");

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const plainLine = stripAnsi(line);
    currentGroup.push(line);

    // Add empty line after pause info, input issues, and before instructions
    if (
      (plainLine.startsWith("Paused by:") && i < lines.length - 1) ||
      (plainLine.startsWith("Missing input:") && i < lines.length - 1) ||
      (plainLine.startsWith("Upstream:") && i < lines.length - 1)
    ) {
      groupedLines.push(...currentGroup, "");
      currentGroup = [];
    }
  }

  groupedLines.push(...currentGroup);

  return box(
    "Pipeline paused",
    [`${withBadge(ANSI.bgRed, "PAUSED")} ${bold("Operator action required")}`, "", ...groupedLines],
    "error",
  );
};

export const formatPipelineError = (error: unknown): string => {
  const message = error instanceof Error ? error.message : String(error);
  return box(
    "Pipeline failed",
    [`${withBadge(ANSI.bgRed, "ERROR")} ${bold("Unhandled failure")}`, "", message],
    "error",
  );
};

export const formatPipelineOverview = (guide: PipelineExecutionGuide): string => {
  const lines = [`${withBadge(ANSI.bgCyan, "GUIDE")} ${bold(guide.title)}`, guide.summary];

  return box("Pipeline overview", lines, "info");
};

/**
 * Strip ANSI escape codes from a string for safe JSON serialization.
 */
export const stripAnsi = (str: string): string => {
  const ansiEscapePattern = new RegExp(String.raw`\u001B\[\d+m`, "g");
  return str.replace(ansiEscapePattern, "");
};
