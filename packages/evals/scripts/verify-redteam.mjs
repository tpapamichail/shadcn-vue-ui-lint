#!/usr/bin/env node
// Deterministic ground truth for the red-team: for each attack sandbox,
// count shadcn/* errors (all five rules at error) and run tsc. An escape
// is lint-clean + typechecks; whether it is genuinely off-system is the
// judge's call, combined in the report.
//
// Usage: node scripts/verify-redteam.mjs [--verbose] <dir1> [dir2 ...]
//
// --verbose prints every finding with its file and line.
import { execFileSync } from "node:child_process"
import * as path from "node:path"
import { pathToFileURL } from "node:url"
import tsParser from "@typescript-eslint/parser"
import vueParser from "vue-eslint-parser"
import { ESLint } from "eslint"

import { RULES, UI_RULES } from "../lib/policy.mjs"

// SHADCN_LINT_PLUGIN points at a built plugin file to measure a build
// that is not the installed one.
const { plugin } = await import(
  process.env.SHADCN_LINT_PLUGIN
    ? pathToFileURL(path.resolve(process.env.SHADCN_LINT_PLUGIN)).href
    : "@tpapamichail/shadcn-vue-lint"
)

const VERBOSE = process.argv.includes("--verbose")
const dirs = process.argv.slice(2).filter((a) => a !== "--verbose")
if (!dirs.length) {
  console.error("Usage: node scripts/verify-redteam.mjs <dir1> [dir2 ...]")
  process.exit(1)
}

// The documented configuration, from lib/policy.mjs: the
// plugin itself.
const preset = { rules: RULES }
const uiPolicy = { rules: UI_RULES }
const rules = preset.rules

const report = {}
for (const dir of dirs) {
  const abs = path.resolve(dir)
  const eslint = new ESLint({
    cwd: abs,
    errorOnUnmatchedPattern: false,
    overrideConfigFile: true,
    overrideConfig: [
      {
        files: ["app/**/*.vue", "components/**/*.vue"],
        languageOptions: {
          // The exact SFC setup the linter is tested with:
          // vue-eslint-parser for the template, @typescript-eslint/parser
          // for the script blocks.
          parser: vueParser,
          parserOptions: {
            parser: tsParser,
            sourceType: "module",
            ecmaFeatures: { jsx: false },
          },
        },
        plugins: { "shadcn-vue": plugin },
        rules,
      },
      { files: ["components/ui/**/*.vue"], rules: uiPolicy.rules },
    ],
  })
  const results = await eslint.lintFiles([
    "app/**/*.vue",
    "components/**/*.vue",
  ])
  const byRule = {}
  const findings = []
  let shadcnErrors = 0
  for (const r of results) {
    for (const m of r.messages) {
      if (!m.ruleId?.startsWith("shadcn-vue/")) continue
      shadcnErrors++
      byRule[m.ruleId] = (byRule[m.ruleId] ?? 0) + 1
      findings.push(
        `${path.relative(abs, r.filePath)}:${m.line} [${m.ruleId}] ${m.message}`
      )
    }
  }
  if (VERBOSE) {
    console.error(`\n== ${dir} ==`)
    for (const line of findings) console.error("  " + line.slice(0, 200))
  }

  let typechecks = true
  let tscError = ""
  try {
    // vue-tsc, not tsc: the generated code is in .vue script blocks,
    // which plain tsc never reads.
    execFileSync("npx", ["vue-tsc", "--noEmit"], { cwd: abs, stdio: "pipe" })
  } catch (err) {
    typechecks = false
    tscError = String(err.stdout ?? "").slice(0, 200)
  }

  report[path.basename(abs)] = {
    shadcnErrors,
    byRule,
    lintClean: shadcnErrors === 0,
    typechecks,
    tscError,
  }
}

console.log(JSON.stringify(report, null, 2))
