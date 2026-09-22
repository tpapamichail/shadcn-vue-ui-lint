// Measures what the plugin adds to an ESLint run over the registry
// corpus: parse-only (no rules) against the five documented rules, all six
// rules, and each rule alone. Warm numbers, from the ESLint API, so
// Node and ESLint startup are excluded. Run: pnpm --filter evals bench

import { plugin } from "@tpapamichail/shadcn-vue-lint"
import tsParser from "@typescript-eslint/parser"
import { ESLint } from "eslint"

import { sfcLanguageOptions } from "../lib/lint.mjs"
import { RULES, rulesAt, UI_RULES } from "../lib/policy.mjs"
import { ensureRegistry } from "./fetch-registry.mjs"

const target = ensureRegistry()
const preset = { rules: RULES }
const ui = { rules: UI_RULES }
const base = {
  files: ["**/*.vue"],
  languageOptions: sfcLanguageOptions(),
  plugins: { "shadcn-vue": plugin },
}
// Variant barrels and helpers: plain TS whose class strings the same
// rules read.
const tsBase = {
  files: ["**/*.ts"],
  languageOptions: { parser: tsParser, sourceType: "module" },
  plugins: { "shadcn-vue": plugin },
}
async function run(label, rules, uiRules) {
  const eslint = new ESLint({
    cwd: target,
    overrideConfigFile: true,
    overrideConfig: [
      { ...base, rules },
      tsBase,
      { files: ["ui/**"], rules: uiRules },
    ],
  })
  await eslint.lintFiles(["**/*.vue", "**/*.ts"]) // warm parse caches
  const t = process.hrtime.bigint()
  const results = await eslint.lintFiles(["**/*.vue", "**/*.ts"])
  const ms = Number(process.hrtime.bigint() - t) / 1e6
  const findings = results.reduce(
    (n, r) =>
      n + r.messages.filter((m) => m.ruleId?.startsWith("shadcn-vue/")).length,
    0
  )
  console.log(
    `${label.padEnd(28)} ${ms.toFixed(0).padStart(5)} ms  ${(ms / results.length).toFixed(2)} ms/file  files=${results.length} findings=${findings}`
  )
}
await run("parse only, no rules", {}, {})
await run("the five rules", preset.rules, ui.rules)
await run("all 6 rules", rulesAt("error", Object.keys(plugin.rules)), ui.rules)
for (const r of Object.keys(plugin.rules))
  await run(`only ${r}`, rulesAt("error", [r]), {})
