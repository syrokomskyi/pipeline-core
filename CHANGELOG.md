# Changelog

All notable changes to the `pipeline-core` project are documented here.

## 2026-07-09 .. 2026-07-15

### Added

- Implement the foundation phase for Axiom, including new apps (dashboard, factory, observatory, vault) and supporting core and provenance packages.

### Changed

- Rename the monorepo scope from @org to @syrokomskyi across all apps, packages, scripts, and documentation.
- Rename @wgogol/code-compass to @syrokomskyi/code-compass throughout the codebase.
- Upgrade dependencies to newer versions and normalize package.json formatting across all apps and packages.
- Bump various dependencies including Astro, tsx, typescript-eslint, and others in the project.

### Fixed

- Update all packages and apps to use node for invoking the eslint binary directly for linting.
- Add eslint to devDependencies in all apps and packages.
- Add @eslint/js and typescript-eslint to devDependencies in all relevant projects.

## 2026-07-02 .. 2026-07-08

### Added

- Add COMPASS scaffolding and functionality to all packages using the annotate command, enabling root-level and package-level COMPASS commands.

### Changed

- Rename @org/compass-checks to @wgogol/compass and refactor related package structure and references.
- Rename @wgogol/compass to @wgogol/code-compass and update dependencies across applications and packages.
- Refactor pipeline-core to split pipeline-engine.ts into separate engine and helper modules.

### Fixed

- Remove forbidden code blocks from multiple packages and scripts to ensure compliance.

### Removed

- Remove legacy compass-checks, compass-codegen, and compass-core packages.

## 2026-06-18 .. 2026-06-24

### Added

- Add automatic stderr piping and EPERM fallback for artifact backup in the pipeline engine.
- Add localize-concept-image prompt and Germany states geo data.

### Changed

- Reformat codebase for consistent style across prompts, documentation, and implementation files.
- Update and synchronize dependencies and minor code improvements across all application and package modules.

### Fixed

- Fix pipeline process to ensure consistent artifact backup and error reporting.

### Removed

- Remove legacy disclaimer, imprint, and privacy-policy legal doc gogoIs from site pipeline.

### Documentation

- Update and reformat documentation and prompts for improved clarity and consistency across multiple apps and packages.

## 2026-06-11 .. 2026-06-17

### Added

- Add hydrateFromArtifacts hook to restore step state from reused artifacts

### Changed

- Update PipelineStep and relevant Gogol classes to implement state restoration mechanism

### Documentation

- Update CHANGE_SUMMARY sections to document state restoration workflow

## 2026-05-21 .. 2026-05-27

### Added

- Add stripAnsi utility to pipeline-core for removing ANSI escape codes from strings, enabling safe JSON serialization of console output.
- Add 2026 Q2 HDRI comparison data and manifest files, including updates to bundeslaender, dimensions, gewerke, matrix, and overview, to support the latest dashboard datasets.

### Changed

- Update pipeline-core utilities and dashboard index page to support new data formats and improve compatibility.

### Fixed

- Correct SyncFromFactoryGogol import to resolve a module reference issue.

## 2026-05-14 .. 2026-05-20

### Added

- Introduce parsePeriod() helper and use it across 8 gogols to standardize period parsing.

### Changed

- Refactor ExportMart CSV generation to use csv-stringify/sync for improved CSV handling.

### Fixed

- Correct IngestAssetStates implementation to expire old asset_states for proper SCD-2 compliance.

### Removed

- Remove provenance mismatch warnings from ScoreHdri for cleaner log output.

## 2026-05-07 .. 2026-05-13

### Added

- Add toRelativePath helper to display paths relative to the Git root for improved console output.

### Changed

- Normalize path separators to forward slashes for cross-platform output and apply toRelativePath to inputDir, outputDir, and artifacts in pipeline status messages.

## 2026-04-30 .. 2026-05-06

### Added

- Add leading newline to box function output for improved console readability.

### Changed

- Translate all package README files from Russian to English, updating descriptions and usage sections.
- Convert inline comments in branche-mapping.ts from Russian to English.

## 2026-04-23 .. 2026-04-29

### Added

- Add core source files for new pipeline modules in business-rate-limit, site-kernel, site-kernel-checks, site-kernel-content, site-kernel-codegen, pipeline-core, pipeline-node, and pipeline-steps packages.
- Add initial implementation files for checks, steps, handlers, and utility functions to support new pipeline operations and rate limiting features.
- Add README files to all packages and application modules for improved documentation.

### Changed

- Improve and expand documentation in os/site-kernel-checks and pipeline-steps README files.

### Fixed

- Fix build errors to enable successful execution of `pnpm build`.

### Removed

- Archive the deprecated business-base app, removing all related source files, documentation, and build outputs.

### Security

- Remove potentially outdated or unsupported dependencies by archiving business-base.

### Documentation

- Add comprehensive documentation and guides across packages and app modules.

## 2026-04-16 .. 2026-04-22

### Added

- Add orchestration, monitoring, and scaling scripts including health reporting and batch archiving utilities.
- Introduce new library modules for k-anonymity gate, cross-database read-only steps, rate-limited HTTP steps, and Playwright pooling.
- Enhance pipeline-core with a JSON logger for improved observability.

### Changed

- Update pipeline steps and Google-related ingestion routines for improved maintainability and anonymity enforcement.
- Update package dependencies and pnpm configuration to support new features.

### Fixed

- Remove redundant TypeScript compiler options from all app and package configurations, unifying settings via tsconfig.base.json.

### Removed

- Remove redundant baseUrl and ignoreDeprecations settings from TypeScript configurations.

### Documentation

- Update pipeline app template documentation to reflect tsconfig changes.

## 2026-04-09 .. 2026-04-15

### Added

- Initialize project by cloning from `pipelines-webgogol-3`, introducing the entire pipeline framework, core packages, and extensive documentation.
- Add comprehensive set of `apps`, `packages`, and `spec` workspaces covering pipeline primitives, AI integration, site building, and async utilities.
- Introduce detailed prompts, processors, and automation flow supporting full pipeline execution, validation, and analysis steps.
- Provide phase, step, and guide documentation for all pipeline stages, including sample input data, templates, and output artifacts.
- Supply example projects, test data, and ready-made markdown, JSON, and binary assets for immediate pipeline usage.

### Changed

- Adapt workspace structure and documentation styles to align with enhanced modular pipeline approach based on previous version.

### Fixed

- Resolve initial issues from import and standardize workspace configurations and build scripts.

### Removed

-

### Security

-

### Documentation

- Provide robust guides, audits, process references, and markdown docs for onboarding and complete visibility into pipeline capabilities.
