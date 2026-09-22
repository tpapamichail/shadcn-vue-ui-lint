#!/usr/bin/env node
// Ratchet gate for the registry corpus: per-rule finding counts must
// never exceed the checked-in baseline. Lower them in the baseline as
// the registry migrates toward deliberate-zero; never raise them.
//
// Usage:
//   node scripts/check-corpus.mjs            # verify against baseline
//   node scripts/check-corpus.mjs --update   # rewrite baseline
import * as fs from "node:fs"
import * as path from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"
import parser from "@typescript-eslint/parser"
import { ESLint } from "eslint"

import { rulesAt, UI_RULES } from "../lib/policy.mjs"
import { ensureRegistry } from "./fetch-registry.mjs"

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// SHADCN_LINT_PLUGIN points at a built plugin file to measure a build
// that is not the installed one (a side build, a candidate release).
const { plugin } = await import(
  process.env.SHADCN_LINT_PLUGIN
    ? pathToFileURL(path.resolve(process.env.SHADCN_LINT_PLUGIN)).href
    : "@tpapamichail/shadcn-vue-lint"
)
const BASELINE_PATH = path.join(__dirname, "corpus-baseline.json")
const uiPolicy = { rules: UI_RULES }

// The registry is fetched at the commit pinned in scripts/registry.json
// so the baseline is reproducible anywhere, CI included. --dir or
// SHADCN_UI_DIR point at a local checkout instead.
const dirIdx = process.argv.indexOf("--dir")
const TARGET =
  dirIdx !== -1
    ? path.resolve(process.argv[dirIdx + 1])
    : process.env.SHADCN_UI_DIR
      ? path.join(process.env.SHADCN_UI_DIR, "apps/v4/registry/new-york-v4")
      : ensureRegistry()
if (!fs.existsSync(TARGET)) {
  console.error(`Registry not found at ${TARGET}.`)
  process.exit(1)
}

const eslint = new ESLint({
  cwd: TARGET,
  errorOnUnmatchedPattern: false,
  overrideConfigFile: true,
  overrideConfig: [
    {
      files: ["**/*.tsx"],
      languageOptions: {
        parser,
        parserOptions: { ecmaFeatures: { jsx: true } },
      },
      plugins: { shadcn: plugin },
      rules: rulesAt("warn", Object.keys(plugin.rules)),
    },
    // The documented policy inside ui, from lib/policy.mjs.
    { files: ["ui/**"], rules: uiPolicy.rules },
  ],
})

const results = await eslint.lintFiles(["**/*.tsx"])
const counts = {}
const fatal = []
for (const rule of Object.keys(plugin.rules)) counts[`shadcn-vue/${rule}`] = 0
for (const result of results) {
  for (const msg of result.messages) {
    if (msg.fatal) fatal.push(`${result.filePath}:${msg.line}: ${msg.message}`)
    if (msg.ruleId?.startsWith("shadcn-vue/")) counts[msg.ruleId]++
  }
}
if (!results.length) {
  console.error("Corpus check found no files to lint.")
  process.exit(1)
}
if (fatal.length) {
  // A count that dropped because a file stopped parsing is not an
  // improvement.
  console.error(`Corpus check: ${fatal.length} file(s) failed to parse:`)
  for (const line of fatal.slice(0, 10)) console.error(`  ${line}`)
  process.exit(1)
}

if (process.argv.includes("--update")) {
  fs.writeFileSync(BASELINE_PATH, JSON.stringify(counts, null, 2) + "\n")
  console.log("Baseline updated:")
  console.log(JSON.stringify(counts, null, 2))
  process.exit(0)
}

const baseline = JSON.parse(fs.readFileSync(BASELINE_PATH, "utf-8"))
let failed = false
for (const [rule, count] of Object.entries(counts)) {
  const max = baseline[rule] ?? 0
  const status = count > max ? "FAIL" : count < max ? "improved" : "ok"
  if (count > max) failed = true
  console.log(`${status.padEnd(9)} ${rule}: ${count} (baseline ${max})`)
}

if (failed) {
  console.error(
    "\nCorpus regression: new violations exceed the baseline. Fix them or, for a deliberate policy change, run with --update."
  )
  process.exit(1)
}
console.log("\nCorpus check passed.")
