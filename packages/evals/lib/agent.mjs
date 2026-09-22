// The agent calls and prompts shared by run.mjs (paired conditions per
// task) and drift.mjs (one project, tasks in sequence). One place, so
// the two harnesses put the same words in front of the model.

import { spawn } from "node:child_process"

import { runCodexAgent } from "./codex.mjs"
import { DEFAULT_MANIFEST } from "./fixture.mjs"
import { formatFindings } from "./lint.mjs"

const CALL_TIMEOUT_MS = 300_000

export function runAgent(
  workdir,
  prompt,
  { model, maxTurns = 24, reasoning = "medium" }
) {
  if (model.startsWith("gpt-")) {
    return runCodexAgent(workdir, prompt, { model, reasoning })
  }

  return new Promise((resolve) => {
    const child = spawn(
      "claude",
      [
        "-p",
        prompt,
        "--model",
        model,
        "--allowedTools",
        "Read,Write,Edit,Glob,Grep",
        "--permission-mode",
        "acceptEdits",
        "--output-format",
        "json",
        "--max-turns",
        String(maxTurns),
      ],
      { cwd: workdir, stdio: ["ignore", "pipe", "pipe"] }
    )
    let stdout = ""
    let stderr = ""
    child.stdout.on("data", (d) => (stdout += d))
    child.stderr.on("data", (d) => (stderr += d))
    const timer = setTimeout(() => child.kill("SIGKILL"), CALL_TIMEOUT_MS)
    child.on("close", (code) => {
      clearTimeout(timer)
      let meta = {}
      try {
        const parsed = JSON.parse(stdout)
        meta = {
          costUsd: parsed.total_cost_usd ?? parsed.cost_usd ?? null,
          numTurns: parsed.num_turns ?? null,
          isError: parsed.is_error ?? code !== 0,
        }
      } catch {
        meta = { costUsd: null, numTurns: null, isError: code !== 0 }
      }
      if (meta.isError) {
        console.error(`    agent error (exit ${code}): ${stderr.slice(0, 300)}`)
      }
      resolve(meta)
    })
  })
}

export function generationPrompt(task, manifest = DEFAULT_MANIFEST) {
  return `You are working in ${manifest.intro}. Read README.md and the components in ${manifest.componentsDir} to see what is available.

## Task

${task.prompt}

Write the component to ${task.file}. Use the existing ui components where possible. Do not install dependencies or run any commands. Write valid, complete TSX.`
}

// Condition C's prompt describes the rules and asks for a fix. It does
// not tell the agent to avoid eslint-disable or style workarounds unless
// forbidWorkarounds is set; that sentence reproduces the runs recorded
// before 2026-09-04.
const RULES = `The rules:
- shadcn-vue/no-restyle: className passed to a ui component may only adjust layout (margin, width, grid/flex placement, visibility). Appearance (colors, typography, spacing, shape, effects, motion) must come from the component's own variants. Use an existing variant if one matches the intent; add a new variant to the component's file in components/ui only if the design explicitly calls for a treatment none of the existing variants provides.
- shadcn-vue/no-raw-colors: color utilities must use the theme's declared tokens (bg-primary, text-muted-foreground), never the raw Tailwind palette (bg-pink-500) or an undeclared name. To add a color, declare it in app/globals.css (a --color-<name> entry in the @theme block, backed by a :root variable), then use bg-<name>.
- shadcn-vue/no-arbitrary-values: arbitrary values on appearance utilities (p-[13px], text-[11px], border-[#E4E4E7]) are banned on any element. Use theme tokens and scale values (p-3, text-xs, border-border); for sizes and spacing, use the nearest scale value.
- shadcn-vue/no-inline-styles: no style attribute except CSS custom properties, and a custom property must not hardcode a color.
- shadcn-vue/require-static-classes: className on ui components must be statically analyzable strings.`

export function feedbackPrompt(
  task,
  findings,
  { forbidWorkarounds = false, manifest = DEFAULT_MANIFEST }
) {
  return `You previously wrote ${task.file} in this shadcn/ui project for this task:

## Task

${task.prompt}

The project's linter (@tpapamichail/shadcn-vue-lint) reports these violations:

${formatFindings(findings)}

${RULES.replaceAll("components/ui", manifest.componentsDir)}

Fix all violations while preserving the intent of the original task. You may edit files under ${manifest.componentsDir} to add variants.${forbidWorkarounds ? " Do not use eslint-disable comments or inline style attributes to work around the rules." : ""}`
}

// The equal-budget control: the same task, the same rules, the same
// editing opportunity, and no diagnostics. The agent is asked to review
// its own work against the rules. Whatever C achieves beyond this is
// what the linter's messages add.
export function reviewPrompt(
  task,
  { forbidWorkarounds = false, manifest = DEFAULT_MANIFEST }
) {
  return `You previously wrote ${task.file} in this shadcn/ui project for this task:

## Task

${task.prompt}

This project enforces styling rules with a linter (@tpapamichail/shadcn-vue-lint). Review ${task.file} against the rules below and fix every violation you find.

${RULES.replaceAll("components/ui", manifest.componentsDir)}

Fix all violations while preserving the intent of the original task. You may edit files under ${manifest.componentsDir} to add variants.${forbidWorkarounds ? " Do not use eslint-disable comments or inline style attributes to work around the rules." : ""}`
}
