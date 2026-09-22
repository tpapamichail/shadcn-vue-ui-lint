# Set up @tpapamichail/shadcn-vue-lint

Install and register `@tpapamichail/shadcn-vue-lint` in the user's project.
Do not enable new rules or change existing rule policies. Once setup is
complete, help the user find where to configure their rules.

Read the [setup and configuration documentation](https://github.com/tpapamichail/shadcn-vue-ui-lint/blob/main/README.md#get-started)
before making changes. The examples there enable rules; use their plugin
and parser setup without adding those rules.

## Inspect the project

- Detect the package manager from the project metadata and lockfile.
- Determine whether this is a single project or a monorepo/workspace.
  Find the apps, shared UI packages, lint configs, and task runner.
- Use the project's existing ESLint setup. If there is none, set up
  ESLint. Check Node.js and ESLint version compatibility against the
  documentation.
- Find the component directories, import aliases, and Tailwind v4 themes.
  Use `components.json` where available. For custom setups, consult the
  [discovery documentation](https://github.com/tpapamichail/shadcn-vue-ui-lint/blob/main/docs/how-it-works.md)
  and configure only the settings the project needs.

## Install and register the plugin

Use the project's package manager. Install dependencies in the package
that owns the lint configuration. In a workspace, follow the existing
shared-config and dependency conventions.

Preserve existing rules, parsers, scripts, and ignores. Register the
plugin through `plugins`. Keep the framework's parser configuration; add
`vue-eslint-parser` with the TypeScript parser for `.vue` files if
needed. Do not add rule presets, enable new rules, or add rule overrides.

In a workspace, account for shared component imports and each app's
theme. Scope any discovery settings to the relevant apps and packages.
Avoid replacing app-specific settings with one workspace-wide value.

Ensure the lint command works with the project's scripts and workspace
task runner. Reuse the existing command where possible; add one if needed.

## Verify and hand off

Run the relevant lint commands to check that the configuration loads.
Separate configuration errors from existing lint findings. With no new
rules enabled, this verifies setup, not design-system enforcement.

Tell the user:

- What was installed and which configuration files changed.
- How to run lint, including workspace commands where applicable.
- That no new `@tpapamichail/shadcn-vue-lint` rules were enabled. If the
  project already had rules configured, explain that those were
  preserved.
- Where to add rules, and where to read the
  [available rules](https://github.com/tpapamichail/shadcn-vue-ui-lint/blob/main/README.md#rules)
  and [configuration examples](https://github.com/tpapamichail/shadcn-vue-ui-lint/blob/main/docs/design-systems.md).

Leave choosing rules and defining what is allowed to the user.
