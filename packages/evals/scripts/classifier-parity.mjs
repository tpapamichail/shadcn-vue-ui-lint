#!/usr/bin/env node
// Measures agreement between the regex classifier (classifyClass) and the
// cn-backed classifier (categoryOf(groupOf(token))) over the registry
// corpus. Tokens come from the recorded corpus JSON plus every className
// string literal found in the registry sources. This is a measurement
// script: extraction is regex-based, not an AST walk.
//
// Usage:
//   npx tsx scripts/classifier-parity.mjs [--corpus <path>] [--dir <path>] [--examples <n>]
import * as fs from "node:fs"
import * as path from "node:path"
import { fileURLToPath } from "node:url"

import { categoryOf } from "../../lint/src/grammar/categories.ts"
import { splitVariants } from "../../lint/src/grammar/classes.ts"
import { groupOf } from "../../lint/src/grammar/classifier.ts"

// The v0 prefix-heuristic classifier, kept here verbatim as the
// measurement baseline. It no longer exists in src.
const V0_GROUPS = {
  color: [
    "bg-",
    "from-",
    "via-",
    "to-",
    "fill-",
    "stroke-",
    "accent-",
    "caret-",
    "divide-",
    "placeholder-",
  ],
  typography: [
    "font-",
    "leading-",
    "tracking-",
    "decoration-",
    "underline",
    "overline",
    "no-underline",
    "line-through",
    "uppercase",
    "lowercase",
    "capitalize",
    "normal-case",
    "italic",
    "not-italic",
    "antialiased",
    "truncate",
    "line-clamp-",
    "list-",
    "indent-",
  ],
  spacing: [
    "p-",
    "px-",
    "py-",
    "pt-",
    "pr-",
    "pb-",
    "pl-",
    "ps-",
    "pe-",
    "gap-",
    "gap-x-",
    "gap-y-",
    "space-x-",
    "space-y-",
  ],
  shape: ["rounded", "border", "outline", "ring"],
  effects: [
    "shadow",
    "inset-shadow",
    "inset-ring",
    "opacity-",
    "blur",
    "backdrop-",
    "brightness-",
    "contrast-",
    "saturate-",
    "grayscale",
    "sepia",
    "invert",
    "hue-rotate-",
    "drop-shadow",
    "mix-blend-",
    "bg-blend-",
  ],
  motion: ["animate-", "transition", "duration-", "ease-", "delay-"],
}
const V0_TEXT_ALIGNMENT = new Set([
  "text-left",
  "text-center",
  "text-right",
  "text-justify",
  "text-start",
  "text-end",
])
function classifyClass(token) {
  const base = splitVariants(token).base.replace(/^!/, "").replace(/^-/, "")
  if (base.startsWith("text-"))
    return V0_TEXT_ALIGNMENT.has(base) ? null : "typography"
  for (const [group, matchers] of Object.entries(V0_GROUPS)) {
    for (const m of matchers) {
      if (
        m.endsWith("-")
          ? base.startsWith(m)
          : base === m || base.startsWith(`${m}-`)
      )
        return group
    }
  }
  return null
}

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(__dirname, "../../..")
// The corpus the lint package's fixtures ship, unless --corpus names
// another file.
const FIXTURE_CORPUS = path.join(
  REPO_ROOT,
  "packages/lint/test/fixtures/registry-corpus.json"
)
// The pinned registry snapshot that fetch-registry.mjs checks out.
const REGISTRY_DIR = path.join(
  REPO_ROOT,
  "packages/evals/.registry/ui/apps/v4/registry/new-york-v4"
)

const args = process.argv.slice(2)
const flag = (name) => {
  const index = args.indexOf(name)
  return index === -1 ? null : args[index + 1]
}
const corpusPath = flag("--corpus") ?? FIXTURE_CORPUS
const targetDir = flag("--dir") ? path.resolve(flag("--dir")) : REGISTRY_DIR
const maxExamples = parseInt(flag("--examples") ?? "5")

function splitTokens(value) {
  return value.split(/\s+/).filter(Boolean)
}

function listTsxFiles(dir) {
  return fs
    .readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".tsx"))
    .map((entry) => path.join(entry.parentPath, entry.name))
}

// Returns the text between the parens of every `name(...)` call, matching
// parens by depth and skipping over string literals so a ")" inside a
// class string does not end the call early.
function callArguments(text, name) {
  const found = []
  const pattern = new RegExp(`\\b${name}\\(`, "g")
  let match
  while ((match = pattern.exec(text))) {
    const start = match.index + match[0].length
    let depth = 1
    let quote = null
    let i = start
    for (; i < text.length && depth > 0; i++) {
      const char = text[i]
      if (quote) {
        if (char === "\\") i++
        else if (char === quote) quote = null
        continue
      }
      if (char === '"' || char === "'" || char === "`") quote = char
      else if (char === "(") depth++
      else if (char === ")") depth--
    }
    found.push(text.slice(start, i - 1))
  }
  return found
}

// Every string literal in a chunk of source. Template literals contribute
// their static parts only.
function stringLiterals(text) {
  const literals = []
  const pattern = /"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)'|`((?:[^`\\]|\\.)*)`/g
  let match
  while ((match = pattern.exec(text))) {
    if (match[3] !== undefined) {
      literals.push(...match[3].split(/\$\{[^}]*\}/))
    } else {
      literals.push(match[1] ?? match[2])
    }
  }
  return literals
}

function classNameLiterals(text) {
  const literals = []
  const pattern =
    /className=(?:"([^"]*)"|'([^']*)'|\{"([^"]*)"\}|\{'([^']*)'\}|\{`([^`]*)`\})/g
  let match
  while ((match = pattern.exec(text))) {
    const value = match[1] ?? match[2] ?? match[3] ?? match[4] ?? match[5]
    literals.push(...value.split(/\$\{[^}]*\}/))
  }
  return literals
}

const corpus = JSON.parse(fs.readFileSync(corpusPath, "utf8"))
const corpusTokens = new Set(
  [...corpus.defaults, ...corpus.callers].flatMap(splitTokens)
)

const files = listTsxFiles(targetDir)
const registryTokens = new Set()
for (const file of files) {
  const text = fs.readFileSync(file, "utf8")
  const literals = [
    ...classNameLiterals(text),
    ...callArguments(text, "cn").flatMap(stringLiterals),
    ...callArguments(text, "cva").flatMap(stringLiterals),
  ]
  for (const literal of literals) {
    for (const token of splitTokens(literal)) registryTokens.add(token)
  }
}

const tokens = [...new Set([...corpusTokens, ...registryTokens])].sort()

const label = (category) => category ?? "null"

let agreed = 0
let oldOnly = 0
let newOnly = 0
const patterns = new Map()
for (const token of tokens) {
  const before = classifyClass(token)
  const group = groupOf(token)
  const after = categoryOf(group)
  if (before === after) {
    agreed++
    continue
  }
  if (after === null) oldOnly++
  if (before === null) newOnly++
  const key = `${label(before)} -> ${label(after)}`
  let entry = patterns.get(key)
  if (!entry) {
    entry = { count: 0, examples: [] }
    patterns.set(key, entry)
  }
  entry.count++
  if (entry.examples.length < maxExamples) {
    entry.examples.push(`${token} (${group ?? "-"})`)
  }
}

const percent = (count) => `${((count / tokens.length) * 100).toFixed(2)}%`

// Paths inside the repo print relative; anything else prints as given.
const display = (target) => {
  const relative = path.relative(REPO_ROOT, target)
  return relative.startsWith("..") ? target : relative
}

console.log(`\nCorpus JSON: ${display(corpusPath)}`)
console.log(
  `  ${corpus.defaults.length} defaults + ${corpus.callers.length} callers -> ${corpusTokens.size} unique tokens`
)
console.log(`Registry sources: ${display(targetDir)}`)
console.log(`  ${files.length} files -> ${registryTokens.size} unique tokens`)
console.log(`\nTotal unique tokens: ${tokens.length}`)
console.log(`Agreement: ${agreed} (${percent(agreed)})`)
console.log(
  `Disagreement: ${tokens.length - agreed} (${percent(tokens.length - agreed)})`
)
console.log(`  old classified, new null: ${oldOnly}`)
console.log(`  old null, new classified: ${newOnly}`)

console.log(`\nDisagreement patterns (old -> new):`)
const rows = [...patterns].sort((a, b) => b[1].count - a[1].count)
const width = Math.max(...rows.map(([key]) => key.length), 0)
for (const [key, { count, examples }] of rows) {
  console.log(`  ${key.padEnd(width)}  ${String(count).padStart(4)}`)
  for (const example of examples) console.log(`    ${example}`)
}
