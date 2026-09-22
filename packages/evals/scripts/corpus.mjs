#!/usr/bin/env node
// Runs the @tpapamichail/shadcn-vue-lint rules across the registry (report-only) to
// measure real-world flag rates. The registry defines idiomatic usage:
// every flag here is either a rule bug or a registry bug.
//
// Usage:
//   node scripts/corpus.mjs [--dir <path>] [--top <n>] [--rule <id>]
//
// --rule prints every finding of one rule instead of the sample.
import * as fs from "node:fs"
import * as path from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"
import tsParser from "@typescript-eslint/parser"
import { ESLint } from "eslint"

import { sfcLanguageOptions } from "../lib/lint.mjs"
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

// The registry is fetched at the commit pinned in scripts/registry.json.
// --dir or SHADCN_REGISTRY_DIR point at a local checkout instead.
const args = process.argv.slice(2)
const dirIdx = args.indexOf("--dir")
const topIdx = args.indexOf("--top")
const ruleIdx = args.indexOf("--rule")
const onlyRule = ruleIdx !== -1 ? args[ruleIdx + 1] : null
const targetDir =
  dirIdx !== -1
    ? path.resolve(args[dirIdx + 1])
    : process.env.SHADCN_REGISTRY_DIR
      ? path.join(
          process.env.SHADCN_REGISTRY_DIR,
          "apps/v4/registry/new-york-v4"
        )
      : ensureRegistry()
const REPO_ROOT = path.resolve(targetDir, "../../..")
const uiPolicy = { rules: UI_RULES }
const top = topIdx !== -1 ? parseInt(args[topIdx + 1]) : 20
if (!fs.existsSync(targetDir)) {
  console.error(`Registry not found at ${targetDir}.`)
  process.exit(1)
}

const eslint = new ESLint({
  cwd: targetDir,
  errorOnUnmatchedPattern: false,
  overrideConfigFile: true,
  overrideConfig: [
    {
      files: ["**/*.vue"],
      languageOptions: sfcLanguageOptions(),
      plugins: { "shadcn-vue": plugin },
      // Every rule at warn: the preset's five and the opt-in
      // no-unknown-classes, measured alongside.
      rules: rulesAt("warn", Object.keys(plugin.rules)),
    },
    {
      // Variant barrels and helpers: plain TS whose class strings the
      // same rules read.
      files: ["**/*.ts"],
      languageOptions: { parser: tsParser, sourceType: "module" },
      plugins: { "shadcn-vue": plugin },
      rules: rulesAt("warn", Object.keys(plugin.rules)),
    },
    // The documented policy inside ui, from lib/policy.mjs.
    { files: ["ui/**"], rules: uiPolicy.rules },
  ],
})

const results = await eslint.lintFiles(["**/*.vue", "**/*.ts"])

const byRule = new Map()
const byClass = new Map()
const flagged = []
let fileCount = 0
let flaggedFileCount = 0

for (const result of results) {
  fileCount++
  const messages = result.messages.filter((m) =>
    m.ruleId?.startsWith("shadcn-vue/")
  )
  if (messages.length === 0) continue
  flaggedFileCount++
  for (const msg of messages) {
    byRule.set(msg.ruleId, (byRule.get(msg.ruleId) ?? 0) + 1)
    const cls = msg.message.match(/^"([^"]+)"/)?.[1]
    if (cls) byClass.set(cls, (byClass.get(cls) ?? 0) + 1)
    flagged.push({
      file: path.relative(REPO_ROOT, result.filePath),
      line: msg.line,
      rule: msg.ruleId,
      message: msg.message,
    })
  }
}

console.log(`\nCorpus: ${path.relative(REPO_ROOT, targetDir)}`)
console.log(`Files scanned: ${fileCount}`)
console.log(
  `Files flagged: ${flaggedFileCount} (${((flaggedFileCount / fileCount) * 100).toFixed(1)}%)`
)
console.log(`Total findings: ${flagged.length}\n`)

console.log("By rule:")
for (const [rule, count] of [...byRule].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${rule}: ${count}`)
}

if (byClass.size) {
  console.log(`\nTop flagged classes:`)
  for (const [cls, count] of [...byClass]
    .sort((a, b) => b[1] - a[1])
    .slice(0, top)) {
    console.log(`  ${String(count).padStart(4)}  ${cls}`)
  }
}

if (onlyRule) {
  const id = onlyRule.startsWith("shadcn-vue/")
    ? onlyRule
    : `shadcn-vue/${onlyRule}`
  console.log(`\nEvery finding of ${id}:`)
  for (const f of flagged.filter((f) => f.rule === id)) {
    console.log(`  ${f.file}:${f.line}  ${f.message}`)
  }
} else {
  console.log(`\nSample findings:`)
  for (const f of flagged.slice(0, top)) {
    console.log(`  ${f.file}:${f.line}`)
    console.log(`    ${f.message}`)
  }
}
