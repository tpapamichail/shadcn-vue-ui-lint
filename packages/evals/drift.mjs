#!/usr/bin/env node
// Drift over time: one project, tasks in sequence, the way a week of
// work goes. Two conditions, each a single persistent work dir:
//
//   A (no lint): every task is generated into the same project; the
//      agent sees what earlier tasks left behind. Violations per task
//      measure ambient drift as the project grows.
//   C (enforced): the same sequence, with lint feedback after each task
//      until green. Violations before feedback per task measure whether
//      enforcement compounds: the vocabulary earlier tasks created
//      should make later tasks cleaner on the first try.
//
// Usage:
//   node evals/drift.mjs [--model <model>] [--tasks <path>] [--fixture <dir>]
//                        [--limit <n>] [--forbid-workarounds]
import * as fs from "node:fs"
import * as os from "node:os"
import * as path from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"

import { feedbackPrompt, generationPrompt, runAgent } from "./lib/agent.mjs"
import { classifyRedirect } from "./lib/classify.mjs"
import { agentFailure, lintWorkdir } from "./lib/lint.mjs"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const args = process.argv.slice(2)
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`)
  return i !== -1 ? args[i + 1] : fallback
}
const MODEL = flag("model", "claude-sonnet-5")
const TASKS_PATH = flag("tasks", path.join(__dirname, "tasks/neutral.json"))
const FIXTURE_NAME = flag("fixture", "fixture-rich")
const FIXTURE = path.join(__dirname, FIXTURE_NAME)
const LIMIT = parseInt(flag("limit", "0")) || 0
const FORBID_WORKAROUNDS = args.includes("--forbid-workarounds")
const MAX_ROUNDS = 3

// The linter's own project readers, for counting the vocabulary.
const lint = await import(
  process.env.SHADCN_LINT_PLUGIN
    ? pathToFileURL(path.resolve(process.env.SHADCN_LINT_PLUGIN)).href
    : "@tpapamichail/shadcn-vue-lint"
)

const runId = `drift-${new Date().toISOString().replace(/[:.]/g, "-")}`
const RUN_DIR = path.join(__dirname, "results", runId)
fs.mkdirSync(RUN_DIR, { recursive: true })

const tasks = JSON.parse(fs.readFileSync(TASKS_PATH, "utf-8")).slice(
  0,
  LIMIT || undefined
)

// Tokens declared in the theme and variants available on the ui
// components, as the linter sees them from a file in the project.
function vocabulary(workdir) {
  const probe = path.join(workdir, "app/probe.tsx")
  const tokens = lint.project.colorTokensFor(probe)?.size ?? 0
  const index = lint.project.componentsFor(probe)
  let variants = 0
  const seen = new Set()
  for (const [name, file] of index.files) {
    const key = `${file}:${name}`
    if (seen.has(key)) continue
    seen.add(key)
    variants += lint.project.variantNamesFor(file, name)?.length ?? 0
  }
  return { tokens, variants }
}

function snapshotUi(workdir) {
  const dir = path.join(workdir, "components/ui")
  const out = new Map()
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isFile()) continue
    out.set(entry.name, fs.readFileSync(path.join(dir, entry.name), "utf-8"))
  }
  out.set(
    "app/globals.css",
    fs.readFileSync(path.join(workdir, "app/globals.css"), "utf-8")
  )
  return out
}

function changedFiles(before, after) {
  const changed = []
  for (const [file, content] of after) {
    if (before.get(file) !== content) changed.push(file)
  }
  return changed
}

function byRule(findings) {
  const counts = {}
  for (const f of findings) counts[f.rule] = (counts[f.rule] ?? 0) + 1
  return counts
}

async function runCondition(condition) {
  const workdir = path.join(RUN_DIR, condition)
  fs.cpSync(FIXTURE, workdir, { recursive: true })
  const enforced = condition === "c"
  const steps = []
  console.log(
    `\n== Condition ${condition.toUpperCase()} (${enforced ? "enforced" : "no lint"}) ==`
  )

  // Every task file written so far must still exist: a later task that
  // deletes an earlier one's output is not a clean project.
  const expected = []
  for (const [i, task] of tasks.entries()) {
    console.log(`\n[${i + 1}/${tasks.length}] ${task.id}`)
    const before = snapshotUi(workdir)
    // The ui directory as it stood before this task, for the classifier.
    const priorDir = fs.mkdtempSync(path.join(os.tmpdir(), "drift-prior-"))
    fs.cpSync(
      path.join(workdir, "components/ui"),
      path.join(priorDir, "components/ui"),
      { recursive: true }
    )
    expected.push(task.file)
    const gen = await runAgent(workdir, generationPrompt(task), {
      model: MODEL,
    })
    let findings = [
      ...agentFailure(gen, task.file),
      ...(await lintWorkdir(workdir, { expectFiles: expected })),
    ]
    const inTask = findings.filter((f) => f.file === task.file)
    console.log(
      `  generated: ${findings.length} violations in project, ${inTask.length} in ${task.file}`
    )
    const step = {
      index: i + 1,
      task: task.id,
      file: task.file,
      generation: {
        costUsd: gen.costUsd,
        numTurns: gen.numTurns,
        violationsInProject: findings.length,
        violationsInTask: inTask.length,
        byRule: byRule(inTask),
      },
    }

    if (enforced) {
      const rounds = []
      while (findings.length > 0 && rounds.length < MAX_ROUNDS) {
        console.log(
          `  round ${rounds.length + 1} (${findings.length} violations)...`
        )
        const meta = await runAgent(
          workdir,
          feedbackPrompt(task, findings, {
            forbidWorkarounds: FORBID_WORKAROUNDS,
          }),
          { model: MODEL }
        )
        findings = [
          ...agentFailure(meta, task.file),
          ...(await lintWorkdir(workdir, { expectFiles: expected })),
        ]
        rounds.push({
          ...meta,
          violationsAfter: findings.length,
          violations: findings,
        })
      }
      const after = snapshotUi(workdir)
      const changed = changedFiles(before, after)
      // The same classifier as the paired runner, against the ui
      // directory as it stood before this task.
      const redirect = classifyRedirect({
        workdir,
        fixtureDir: priorDir,
        task,
        findings,
      })
      step.enforcement = {
        rounds,
        violationsAfter: findings.length,
        redirect,
        systemFilesChanged: changed,
      }
      console.log(
        `  ${findings.length} violations after ${rounds.length} round(s) -> ${redirect}${changed.length ? ` (${changed.join(", ")})` : ""}`
      )
    }

    step.vocabulary = vocabulary(workdir)
    console.log(
      `  vocabulary: ${step.vocabulary.tokens} tokens, ${step.vocabulary.variants} variants`
    )
    steps.push(step)
  }
  return steps
}

console.log(`Run: ${runId}`)
console.log(`Model: ${MODEL}`)
console.log(`Fixture: ${FIXTURE_NAME}`)
console.log(`Tasks: ${tasks.map((t) => t.id).join(", ")}`)

const a = await runCondition("a")
const c = await runCondition("c")

const outPath = path.join(RUN_DIR, "results.json")
fs.writeFileSync(
  outPath,
  JSON.stringify(
    {
      runId,
      model: MODEL,
      tasks: path.relative(__dirname, TASKS_PATH),
      fixture: FIXTURE_NAME,
      forbidWorkarounds: FORBID_WORKAROUNDS,
      a,
      c,
    },
    null,
    2
  )
)

console.log(
  `\n| # | Task | A: new | A: total | C: before | C: rounds | C: redirect | C: tokens | C: variants |`
)
console.log(
  `| - | ---- | -----: | -------: | --------: | --------: | ----------- | --------: | ----------: |`
)
for (let i = 0; i < tasks.length; i++) {
  const sa = a[i]
  const sc = c[i]
  console.log(
    `| ${i + 1} | ${sa.task} | ${sa.generation.violationsInTask} | ${sa.generation.violationsInProject} | ${sc.generation.violationsInTask} | ${sc.enforcement.rounds.length} | ${sc.enforcement.redirect} | ${sc.vocabulary.tokens} | ${sc.vocabulary.variants} |`
  )
}
console.log(`\nResults: ${outPath}`)
