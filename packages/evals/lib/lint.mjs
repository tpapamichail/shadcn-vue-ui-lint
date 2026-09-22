// Shared lint runner for the eval harness. Lints the app/ files of a
// work dir with every @tpapamichail/shadcn-vue-lint rule at error and returns findings.

import * as fs from "node:fs"
import * as path from "node:path"
import { pathToFileURL } from "node:url"
import tsParser from "@typescript-eslint/parser"
import vueParser from "vue-eslint-parser"
import { ESLint } from "eslint"

import { readComponent } from "./component.mjs"
import { manifestFor } from "./fixture.mjs"
import { rulesFor, UI_RULES } from "./policy.mjs"

// SHADCN_LINT_PLUGIN points at a built plugin file to measure a build
// that is not the installed one (a side build, a candidate release).
const { plugin } = await import(
  process.env.SHADCN_LINT_PLUGIN
    ? pathToFileURL(path.resolve(process.env.SHADCN_LINT_PLUGIN)).href
    : "@tpapamichail/shadcn-vue-lint"
)

// The documented configuration, from lib/policy.mjs.
const uiPolicy = { rules: UI_RULES }

// The exact SFC setup the linter is tested with: vue-eslint-parser for
// the template, @typescript-eslint/parser for the script blocks.
function sfcLanguageOptions() {
  return {
    parser: vueParser,
    parserOptions: {
      parser: tsParser,
      sourceType: "module",
      ecmaFeatures: { jsx: false },
    },
  }
}

// Lints the work dir. Findings are the shadcn rules' diagnostics plus
// harness validity checks so that broken or missing task output never
// counts as clean. Expected files must export a component and build.
export async function lintWorkdir(workdir, { expectFiles = [] } = {}) {
  const manifest = manifestFor(workdir)
  const uiGlob = `${manifest.componentsDir}/**/*.vue`
  const rules = rulesFor(manifest)
  const eslint = new ESLint({
    cwd: workdir,
    errorOnUnmatchedPattern: false,
    overrideConfigFile: true,
    overrideConfig: [
      {
        files: ["app/**/*.vue", uiGlob],
        languageOptions: sfcLanguageOptions(),
        plugins: { "shadcn-vue": plugin },
        rules,
      },
      // The preset's policy inside ui, so an escape into a component
      // file counts exactly as it would for a user.
      { files: [uiGlob], rules: uiPolicy.rules },
    ],
  })

  const results = await eslint.lintFiles(["app/**/*.vue", uiGlob])
  const findings = []
  for (const file of expectFiles) {
    const full = path.join(workdir, file)
    if (!fs.existsSync(full)) {
      findings.push({
        file,
        line: 0,
        rule: "harness/missing-file",
        message: `${file} was not written.`,
      })
      continue
    }
    const output = await readComponent(workdir, file)
    findings.push(...output.findings)
  }
  for (const result of results) {
    for (const msg of result.messages) {
      if (msg.fatal) {
        if (
          findings.some(
            (finding) =>
              finding.file === path.relative(workdir, result.filePath) &&
              finding.rule === "harness/parse-error"
          )
        )
          continue
        findings.push({
          file: path.relative(workdir, result.filePath),
          line: msg.line ?? 0,
          rule: "harness/parse-error",
          message: msg.message,
        })
        continue
      }
      if (!msg.ruleId?.startsWith("shadcn-vue/")) continue
      findings.push({
        file: path.relative(workdir, result.filePath),
        line: msg.line,
        rule: msg.ruleId,
        message: msg.message,
      })
    }
  }
  return findings
}

// A finding for an agent call that failed, so a run that produced no
// usable output never reads as converged.
export function agentFailure(meta, file) {
  if (!meta?.isError) return []
  return [
    {
      file,
      line: 0,
      rule: "harness/agent-error",
      message: "The agent call failed or exited with an error.",
    },
  ]
}

export function formatFindings(findings) {
  return findings
    .map((f) => `${f.file}:${f.line} [${f.rule}] ${f.message}`)
    .join("\n")
}
