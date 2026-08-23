import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { expect, test } from "vitest";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../..");
const inventoryPath = path.join(repositoryRoot, "docs/pipeline-artifact-consumers.generated.yaml");

const walkPackageManifests = async (root: string): Promise<string[]> => {
  const lockfile = await fs.readFile(path.join(root, "pnpm-lock.yaml"), "utf8");
  const importers = lockfile.slice(lockfile.indexOf("\nimporters:\n"), lockfile.indexOf("\npackages:\n"));
  return [...importers.matchAll(/^  ([^\s][^:]*):$/gm)]
    .map((match) => match[1]!.replace(/^['"]|['"]$/g, ""))
    .filter((packagePath) => packagePath !== ".")
    .map((packagePath) => path.join(root, packagePath, "package.json"));
};

test("the checked inventory exactly matches every workspace pipeline consumer", async () => {
  const manifests = await walkPackageManifests(repositoryRoot);
  const actual: string[] = [];
  for (const manifestPath of manifests) {
    const source = await fs.readFile(manifestPath, "utf8");
    if (!/@syrokomskyi\/pipeline-(?:core|node)/.test(source)) continue;
    actual.push(path.relative(repositoryRoot, path.dirname(manifestPath)).split(path.sep).join("/"));
  }
  const inventory = await fs.readFile(inventoryPath, "utf8");
  const expected = inventory.split(/\r?\n/).flatMap((line) => {
    const match = /^  - (.+)$/.exec(line);
    return match ? [match[1]!] : [];
  });
  expect(actual.sort()).toEqual(expected.sort());
});

test("pipeline consumers contain no local artifact reuse policy", async () => {
  const inventory = await fs.readFile(inventoryPath, "utf8");
  const consumers = inventory.split(/\r?\n/).flatMap((line) => {
    const match = /^  - (.+)$/.exec(line);
    return match ? [match[1]!] : [];
  });
  const violations: string[] = [];
  const legacy =
    /PipelineReusePolicy|reuse_valid_artifacts|always_run|reusePolicy|Skipping[^\n]*(?:already exists|exists[^\n]*skipping)/i;
  for (const consumer of consumers) {
    const root = path.join(repositoryRoot, consumer);
    const visit = async (directory: string): Promise<void> => {
      for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
        if (["node_modules", "dist", ".output"].includes(entry.name) || entry.name.startsWith(".")) continue;
        const absolute = path.join(directory, entry.name);
        if (entry.isDirectory()) await visit(absolute);
        else if (/\.(?:ts|tsx)$/.test(entry.name) && !entry.name.endsWith(".test.ts") && legacy.test(await fs.readFile(absolute, "utf8"))) violations.push(path.relative(repositoryRoot, absolute));
      }
    };
    await visit(root);
  }
  expect(violations).toEqual([]);
});
