#!/usr/bin/env node
// Aggregates multiple temptation-suite runs into variance statistics:
// per-task and overall mean/min/max for before-violations, green rate,
// and rounds to green. Single-run numbers invite the "n=1" objection;
// this answers it.
//
// Usage: node evals/aggregate-runs.mjs <run-id> [run-id ...]
//        node evals/aggregate-runs.mjs --from evals/results/variance-runs.txt
import * as fs from "node:fs"
import * as path from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const RESULTS_DIR = path.join(__dirname, "results")

let runIds = process.argv.slice(2)
const fromIdx = runIds.indexOf("--from")
if (fromIdx !== -1) {
  const listPath = path.resolve(runIds[fromIdx + 1])
  runIds = fs
    .readFileSync(listPath, "utf-8")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
}
if (!runIds.length) {
  console.error("Usage: node evals/aggregate-runs.mjs <run-id> [...]")
  process.exit(1)
}

const runs = runIds.map((id) => {
  const data = JSON.parse(
    fs.readFileSync(path.join(RESULTS_DIR, id, "results.json"), "utf-8")
  )
  return { id, model: data.model, results: data.results }
})

const stat = (xs) => ({
  mean: Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10,
  min: Math.min(...xs),
  max: Math.max(...xs),
})
const fmt = (s) => `${s.mean} (${s.min}–${s.max})`

// Per-task aggregation across runs.
const taskIds = [...new Set(runs.flatMap((r) => r.results.map((t) => t.task)))]
const perTask = []
for (const task of taskIds) {
  const samples = runs
    .map((r) => r.results.find((t) => t.task === task))
    .filter(Boolean)
  perTask.push({
    task,
    n: samples.length,
    before: stat(samples.map((s) => s.a.violations.length)),
    rounds: stat(samples.map((s) => s.c.rounds.length)),
    green: samples.filter((s) => s.c.violations.length === 0).length,
    redirects: samples.map((s) => s.c.redirect),
  })
}

// Overall per-run totals.
const totals = runs.map((r) => ({
  id: r.id,
  before: r.results.reduce((s, t) => s + t.a.violations.length, 0),
  after: r.results.reduce((s, t) => s + t.c.violations.length, 0),
  green: r.results.filter((t) => t.c.violations.length === 0).length,
  tasks: r.results.length,
}))

console.log(`Runs: ${runs.length} (model: ${runs[0].model})\n`)
console.log(`| Run | Before | After | Green |`)
console.log(`|---|---|---|---|`)
for (const t of totals) {
  console.log(`| ${t.id} | ${t.before} | ${t.after} | ${t.green}/${t.tasks} |`)
}
const beforeStat = stat(totals.map((t) => t.before))
const afterStat = stat(totals.map((t) => t.after))
console.log(
  `\nOverall: before ${fmt(beforeStat)} violations/run, after ${fmt(afterStat)}, ` +
    `green ${totals.reduce((s, t) => s + t.green, 0)}/${totals.reduce((s, t) => s + t.tasks, 0)} tasks`
)

console.log(
  `\n| Task | n | Before (mean, range) | Rounds | Green | Redirects |`
)
console.log(`|---|---|---|---|---|---|`)
for (const t of perTask) {
  const redirectCounts = {}
  for (const r of t.redirects) redirectCounts[r] = (redirectCounts[r] ?? 0) + 1
  const redirectStr = Object.entries(redirectCounts)
    .map(([k, v]) => `${k}×${v}`)
    .join(", ")
  console.log(
    `| ${t.task} | ${t.n} | ${fmt(t.before)} | ${fmt(t.rounds)} | ${t.green}/${t.n} | ${redirectStr} |`
  )
}
