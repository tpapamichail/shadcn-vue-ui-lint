#!/usr/bin/env node
// Renders a markdown scorecard with before/after cards from a
// results.json produced by run.mjs.
//
// Usage: node evals/report.mjs <path-to-results.json>
import * as fs from "node:fs"
import * as path from "node:path"

const resultsPath = process.argv[2]
if (!resultsPath) {
  console.error("Usage: node evals/report.mjs <results.json>")
  process.exit(1)
}

const { runId, model, results } = JSON.parse(
  fs.readFileSync(resultsPath, "utf-8")
)
const runDir = path.dirname(resultsPath)

function readOutput(taskId, condition, file) {
  try {
    return fs.readFileSync(path.join(runDir, taskId, condition, file), "utf-8")
  } catch {
    return "(missing)"
  }
}

const lines = []
lines.push(`# Temptation Suite — ${model}`)
lines.push(``)
lines.push(`Run: \`${runId}\``)
lines.push(``)

// Scoreboard.
const totalA = results.reduce((s, r) => s + r.a.violations.length, 0)
const totalC = results.reduce((s, r) => s + r.c.violations.length, 0)
const green = results.filter((r) => r.c.violations.length === 0).length
const redirects = {}
for (const r of results) {
  redirects[r.c.redirect] = (redirects[r.c.redirect] ?? 0) + 1
}

const hasControl = results.some((r) => r.b)
const totalB = results.reduce((s, r) => s + (r.b?.violations.length ?? 0), 0)
const greenB = results.filter((r) => r.b && r.b.violations.length === 0).length
const roundsOf = (c) => c.rounds.length
const meanRounds = (pick) => {
  const list = results.map(pick).filter((c) => c)
  return list.length
    ? (list.reduce((s, c) => s + roundsOf(c), 0) / list.length).toFixed(2)
    : "n/a"
}

lines.push(`## Scoreboard`)
lines.push(``)
if (hasControl) {
  lines.push(
    `| Metric | Before (no lint) | Control (rules, no diagnostics) | After (@tpapamichail/shadcn-vue-lint) |`
  )
  lines.push(`|---|---|---|---|`)
  lines.push(`| Total violations | ${totalA} | ${totalB} | ${totalC} |`)
  lines.push(
    `| Tasks lint-green | ${results.filter((r) => r.a.violations.length === 0).length}/${results.length} | ${greenB}/${results.length} | ${green}/${results.length} |`
  )
  lines.push(
    `| Mean rounds used | n/a | ${meanRounds((r) => r.b)} | ${meanRounds((r) => r.c)} |`
  )
} else {
  lines.push(`| Metric | Before (no lint) | After (@tpapamichail/shadcn-vue-lint) |`)
  lines.push(`|---|---|---|`)
  lines.push(`| Total violations | ${totalA} | ${totalC} |`)
  lines.push(
    `| Tasks lint-green | ${results.filter((r) => r.a.violations.length === 0).length}/${results.length} | ${green}/${results.length} |`
  )
}
lines.push(``)
if (hasControl) {
  lines.push(
    `Per task (violations after each round; control rounds are gated by a lint the agent never saw):`
  )
  lines.push(``)
  lines.push(
    `| Task | A | B rounds | B after | B outcome | C rounds | C after | C outcome |`
  )
  lines.push(`|---|---|---|---|---|---|---|---|`)
  for (const r of results) {
    const trail = (c) =>
      c.rounds.map((x) => x.violationsAfter).join(" → ") || "—"
    lines.push(
      `| ${r.task} | ${r.a.violations.length} | ${trail(r.b)} | ${r.b.violations.length} | ${r.b.redirect} | ${trail(r.c)} | ${r.c.violations.length} | ${r.c.redirect} |`
    )
  }
  lines.push(``)
}
lines.push(`Redirect outcomes (after):`)
lines.push(``)
for (const [kind, count] of Object.entries(redirects).sort(
  (a, b) => b[1] - a[1]
)) {
  lines.push(`- \`${kind}\`: ${count}`)
}
lines.push(``)
const hasFidelity = results.some((r) => r.fidelity)
lines.push(
  hasFidelity
    ? `| Task | Before | Rounds | After | Outcome | Fidelity |`
    : `| Task | Before | Rounds | After | Outcome |`
)
lines.push(hasFidelity ? `|---|---|---|---|---|---|` : `|---|---|---|---|---|`)
for (const r of results) {
  const row = `| ${r.task} | ${r.a.violations.length} | ${r.c.rounds.length} | ${r.c.violations.length} | ${r.c.redirect} |`
  if (hasFidelity) {
    const f = r.fidelity
    const cell = f?.unjudgeable
      ? "unjudgeable"
      : f?.score != null
        ? `${f.sameIntent ? "✓" : "✗"} ${f.score}/10`
        : "n/a"
    lines.push(`${row} ${cell} |`)
  } else {
    lines.push(row)
  }
}
lines.push(``)

// Cards.
for (const r of results) {
  lines.push(`## ${r.task}`)
  lines.push(``)
  lines.push(`> ${r.prompt}`)
  lines.push(``)
  lines.push(
    `**Before:** ${r.a.violations.length} violations. **After:** ${r.c.violations.length} violations in ${r.c.rounds.length} round(s). **Outcome:** \`${r.c.redirect}\`.`
  )
  lines.push(``)
  if (r.fidelity?.unjudgeable) {
    lines.push(
      `**Fidelity:** unjudgeable — both conditions rendered an empty subject, so no verdict was taken.`
    )
    lines.push(``)
  } else if (r.fidelity?.score != null) {
    lines.push(
      `**Fidelity (${r.fidelity.judgeModel}):** ${r.fidelity.sameIntent ? "intent preserved" : "INTENT LOST"} — ${r.fidelity.score}/10. ${r.fidelity.notes ?? ""}`
    )
    lines.push(``)
    lines.push(`![before](${r.fidelity.aPng}) ![after](${r.fidelity.cPng})`)
    lines.push(``)
  }
  if (r.a.violations.length) {
    lines.push(`<details><summary>Violations (before)</summary>`)
    lines.push(``)
    for (const v of r.a.violations) {
      lines.push(`- \`${v.file}:${v.line}\` ${v.message}`)
    }
    lines.push(``)
    lines.push(`</details>`)
    lines.push(``)
  }
  lines.push(`<details><summary>Before — ${r.file}</summary>`)
  lines.push(``)
  lines.push("```tsx")
  lines.push(readOutput(r.task, "a", r.file).trim())
  lines.push("```")
  lines.push(``)
  lines.push(`</details>`)
  lines.push(``)
  lines.push(`<details><summary>After — ${r.file}</summary>`)
  lines.push(``)
  lines.push("```tsx")
  lines.push(readOutput(r.task, "c", r.file).trim())
  lines.push("```")
  lines.push(``)
  lines.push(`</details>`)
  lines.push(``)
}

const outPath = path.join(runDir, "report.md")
fs.writeFileSync(outPath, lines.join("\n"))
console.log(`Report: ${outPath}`)
