#!/usr/bin/env node
// Fidelity guard: renders the before (A) and after (C) outputs of a
// run, screenshots both, and asks a judge model whether the after
// preserves the design intent. Lint-green achieved by styling less is
// a failure, and this is the check that catches it.
//
// Usage: node evals/fidelity.mjs <results.json> [--judge-model <model>] [--passes <n>] [--force]
//
// The judge is a model and varies between passes on identical
// screenshots; --passes runs it n times (default 3) and records the
// median score and the majority sameIntent, keeping every pass.
import { spawnSync } from "node:child_process"
import * as fs from "node:fs"
import * as path from "node:path"

import { renderToScreenshot } from "./lib/render.mjs"

const resultsPath = process.argv[2]
if (!resultsPath) {
  console.error("Usage: node evals/fidelity.mjs <results.json>")
  process.exit(1)
}
const args = process.argv.slice(3)
const judgeIdx = args.indexOf("--judge-model")
const JUDGE_MODEL = judgeIdx !== -1 ? args[judgeIdx + 1] : "claude-fable-5"
const passesIdx = args.indexOf("--passes")
const PASSES = passesIdx !== -1 ? Math.max(1, parseInt(args[passesIdx + 1])) : 3

const data = JSON.parse(fs.readFileSync(resultsPath, "utf-8"))
const runDir = path.dirname(path.resolve(resultsPath))

function judge(task, beforePng, afterPng) {
  const prompt = `You are judging design fidelity for a UI code transformation. A component was regenerated to satisfy lint rules; the transformation must preserve the design intent.

The original task was:
"${task.prompt}"

Read these two screenshots:
- BEFORE (no lint): ${beforePng}
- AFTER (lint-enforced): ${afterPng}

Judge whether AFTER still satisfies the design intent of the task. Pay particular attention to requirements the task states explicitly (specific colors, sizes, emphasis). Cosmetic differences that keep the intent are fine; dropping or weakening a stated requirement is not.

Rubric for values: the transformation is allowed to snap a stated value to the nearest design-system token, so 13px padding rendered at 12px, 11px text at 12px, or a stated hex color replaced by the visually nearest theme color all count as intent preserved (score 8-10) as long as the element still reads the way the task asked. Intent is lost when a stated emphasis, color family, shape, or element is missing or reversed, or when AFTER is visibly plainer than the task asked for.

Respond with ONLY a JSON object, no other text:
{"sameIntent": true|false, "score": 0-10, "notes": "<one sentence>"}
Where score 10 = intent fully preserved, 5 = partially, 0 = intent lost.`

  const result = spawnSync(
    "claude",
    [
      "-p",
      prompt,
      "--model",
      JUDGE_MODEL,
      "--allowedTools",
      "Read",
      "--output-format",
      "json",
    ],
    { encoding: "utf-8", timeout: 180_000 }
  )
  try {
    const parsed = JSON.parse(result.stdout)
    const text = parsed.result ?? ""
    const json = text.match(/\{[\s\S]*\}/)?.[0]
    return json ? JSON.parse(json) : { error: "no json in judge output" }
  } catch {
    return { error: `judge failed: ${result.stderr?.slice(0, 200)}` }
  }
}

for (const r of data.results) {
  // Skip tasks that already have a verdict; pass --force to redo.
  if (r.fidelity?.score != null && !args.includes("--force")) {
    console.log(`\n[${r.task}] already judged, skipping`)
    continue
  }
  console.log(`\n[${r.task}]`)
  const fidelity = { judgeModel: JUDGE_MODEL }
  for (const condition of ["a", "c"]) {
    const workdir = path.join(runDir, r.task, condition)
    const outPng = path.join(runDir, r.task, `preview-${condition}.png`)
    try {
      const shot = await renderToScreenshot({
        workdir,
        taskFile: r.file,
        outPng,
      })
      console.log(
        `  ${condition}: rendered${shot?.judgeable === false ? " (empty subject)" : ""}`
      )
      fidelity[`${condition}Png`] = path.relative(runDir, outPng)
      if (shot?.judgeable === false) fidelity[`${condition}Empty`] = true
    } catch (err) {
      console.log(`  ${condition}: render failed — ${err.message}`)
      fidelity[`${condition}Error`] = err.message
    }
  }

  if (fidelity.aEmpty && fidelity.cEmpty) {
    // Both renders are empty: the judge would be comparing two blank
    // pills. Recorded as unjudgeable, not scored.
    fidelity.unjudgeable = true
    console.log(`  unjudgeable: both renders are empty`)
  } else if (fidelity.aPng && fidelity.cPng) {
    const passes = []
    for (let i = 0; i < PASSES; i++) {
      const verdict = judge(
        r,
        path.join(runDir, fidelity.aPng),
        path.join(runDir, fidelity.cPng)
      )
      passes.push(verdict)
      console.log(
        `  judge ${i + 1}/${PASSES}: sameIntent=${verdict.sameIntent} score=${verdict.score} — ${verdict.notes ?? verdict.error}`
      )
    }
    const scored = passes.filter((p) => typeof p.score === "number")
    if (scored.length) {
      const scores = scored.map((p) => p.score).sort((a, b) => a - b)
      const median = scores[Math.floor((scores.length - 1) / 2)]
      const yes = scored.filter((p) => p.sameIntent === true).length
      const representative = scored.find((p) => p.score === median) ?? scored[0]
      Object.assign(fidelity, {
        passes,
        score: median,
        sameIntent: yes * 2 > scored.length,
        notes: representative.notes,
      })
      console.log(
        `  median score ${median}, sameIntent ${yes}/${scored.length}`
      )
    } else {
      Object.assign(fidelity, { passes, error: passes[0]?.error })
    }
  }
  r.fidelity = fidelity
}

fs.writeFileSync(resultsPath, JSON.stringify(data, null, 2))
console.log(`\nUpdated: ${resultsPath}`)
