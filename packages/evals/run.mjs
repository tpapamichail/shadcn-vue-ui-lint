#!/usr/bin/env node
// Temptation-suite eval runner.
//
// Condition A (before): one fresh, context-free agent generates the
// component with no lint anywhere.
// Condition C (after): starts from A's exact output, then gets
// @tpapamichail/shadcn-vue-lint diagnostics fed back (like tsc errors) for up to
// MAX_ROUNDS rounds.
//
// Condition B (control, --control): also starts from A's exact output
// and gets the same rules text and the same round budget as C, but no
// diagnostics: it is asked to review its own work. Its rounds are gated
// by a silent lint the agent never sees, so both conditions stop under
// the same rule. The gap between B and C is what the messages add.
//
// Usage:
//   node evals/run.mjs [--model <model>] [--tasks <path>] [--only <id>]
//                      [--fixture <dir>] [--forbid-workarounds] [--control]
import * as fs from "node:fs"
import * as path from "node:path"
import { fileURLToPath } from "node:url"

import {
  feedbackPrompt,
  generationPrompt,
  reviewPrompt,
  runAgent,
} from "./lib/agent.mjs"
import { classifyRedirect } from "./lib/classify.mjs"
import { manifestFor } from "./lib/fixture.mjs"
import { agentFailure, lintWorkdir } from "./lib/lint.mjs"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
// --fixture names a directory under evals/ to copy for each task; the
// default is the three-component fixture the temptation suite was
// measured on, fixture-rich has the eleven components a fresh shadcn
// project ships with.
const FIXTURE_NAME = process.argv.includes("--fixture")
  ? process.argv[process.argv.indexOf("--fixture") + 1]
  : "fixture"
const FIXTURE = path.join(__dirname, FIXTURE_NAME)
const MANIFEST = manifestFor(FIXTURE)
const MAX_ROUNDS = 3

const args = process.argv.slice(2)
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`)
  return i !== -1 ? args[i + 1] : fallback
}
const MODEL = flag("model", "claude-sonnet-5")
const REASONING = flag("reasoning", "medium")
const AGENT_OPTIONS = { model: MODEL, reasoning: REASONING }
const TASKS_PATH = flag("tasks", path.join(__dirname, "tasks/temptation.json"))
const ONLY = flag("only", null)
// Condition C's prompt used to end with "Do not use eslint-disable
// comments or inline style attributes to work around the rules", which
// made the zero counts for those outcomes measure an instruction as
// much as the linter. The default is now the plain prompt; pass
// --forbid-workarounds to reproduce the earlier runs.
const FORBID_WORKAROUNDS = args.includes("--forbid-workarounds")
const CONTROL = args.includes("--control")

const runId = `run-${new Date().toISOString().replace(/[:.]/g, "-")}${MODEL.startsWith("gpt-") ? `-${MODEL}` : ""}`
const RUN_DIR = path.join(__dirname, "results", runId)
fs.mkdirSync(RUN_DIR, { recursive: true })

function copyFixture(dest) {
  fs.cpSync(FIXTURE, dest, { recursive: true })
}

async function runTask(task) {
  console.log(`\n[${task.id}]`)
  const taskDir = path.join(RUN_DIR, task.id)

  // Condition A: one clean generation, no lint.
  const aDir = path.join(taskDir, "a")
  copyFixture(aDir)
  console.log(`  A: generating...`)
  const aMeta = await runAgent(
    aDir,
    generationPrompt(task, MANIFEST),
    AGENT_OPTIONS
  )
  const aFindings = [
    ...agentFailure(aMeta, task.file),
    ...(await lintWorkdir(aDir, { expectFiles: [task.file] })),
  ]
  console.log(`  A: ${aFindings.length} violations`)

  // Condition B: A's exact output, the rules, no diagnostics.
  let b = null
  if (CONTROL) {
    const bDir = path.join(taskDir, "b")
    fs.cpSync(aDir, bDir, { recursive: true })
    const bRounds = []
    let bFindings = aFindings
    while (bFindings.length > 0 && bRounds.length < MAX_ROUNDS) {
      console.log(
        `  B: round ${bRounds.length + 1} (${bFindings.length} violations, unseen by the agent)...`
      )
      const meta = await runAgent(
        bDir,
        reviewPrompt(task, {
          forbidWorkarounds: FORBID_WORKAROUNDS,
          manifest: MANIFEST,
        }),
        AGENT_OPTIONS
      )
      bFindings = [
        ...agentFailure(meta, task.file),
        ...(await lintWorkdir(bDir, { expectFiles: [task.file] })),
      ]
      bRounds.push({
        ...meta,
        violationsAfter: bFindings.length,
        violations: bFindings,
      })
    }
    const bRedirect = classifyRedirect({
      workdir: bDir,
      fixtureDir: FIXTURE,
      task,
      findings: bFindings,
    })
    console.log(
      `  B: ${bFindings.length} violations after ${bRounds.length} round(s) -> ${bRedirect}`
    )
    b = { violations: bFindings, rounds: bRounds, redirect: bRedirect }
  }

  // Condition C: starts from A's exact output, lint fed back.
  const cDir = path.join(taskDir, "c")
  fs.cpSync(aDir, cDir, { recursive: true })
  const rounds = []
  let cFindings = aFindings
  while (cFindings.length > 0 && rounds.length < MAX_ROUNDS) {
    console.log(
      `  C: round ${rounds.length + 1} (${cFindings.length} violations)...`
    )
    const meta = await runAgent(
      cDir,
      feedbackPrompt(task, cFindings, {
        forbidWorkarounds: FORBID_WORKAROUNDS,
        manifest: MANIFEST,
      }),
      AGENT_OPTIONS
    )
    cFindings = [
      ...agentFailure(meta, task.file),
      ...(await lintWorkdir(cDir, { expectFiles: [task.file] })),
    ]
    rounds.push({
      ...meta,
      violationsAfter: cFindings.length,
      violations: cFindings,
    })
  }

  const redirect = classifyRedirect({
    workdir: cDir,
    fixtureDir: FIXTURE,
    task,
    findings: cFindings,
  })
  console.log(
    `  C: ${cFindings.length} violations after ${rounds.length} round(s) -> ${redirect}`
  )

  return {
    task: task.id,
    prompt: task.prompt,
    file: task.file,
    a: {
      ...aMeta,
      violations: aFindings,
    },
    ...(b ? { b } : {}),
    c: {
      violations: cFindings,
      rounds,
      redirect,
    },
  }
}

const tasks = JSON.parse(fs.readFileSync(TASKS_PATH, "utf-8")).filter(
  (t) => !ONLY || t.id === ONLY
)

console.log(`Run: ${runId}`)
console.log(`Model: ${MODEL}`)
console.log(`Tasks: ${tasks.map((t) => t.id).join(", ")}`)

const results = []
const outPath = path.join(RUN_DIR, "results.json")
for (const task of tasks) {
  results.push(await runTask(task))
  fs.writeFileSync(
    outPath,
    JSON.stringify(
      {
        runId,
        model: MODEL,
        ...(MODEL.startsWith("gpt-")
          ? { provider: "codex", reasoning: REASONING }
          : {}),
        tasks: path.relative(__dirname, TASKS_PATH),
        fixture: FIXTURE_NAME,
        forbidWorkarounds: FORBID_WORKAROUNDS,
        control: CONTROL,
        results,
      },
      null,
      2
    )
  )
}
console.log(`\nResults: ${outPath}`)
