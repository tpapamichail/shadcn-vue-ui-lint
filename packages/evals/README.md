# @tpapamichail/shadcn-vue-lint evals

The harness that measures agent-written UI before and after `@tpapamichail/shadcn-vue-lint`
feedback. What it shows, how a run works, the recorded numbers, and how
to reproduce them are all in [docs/evals.md](../../docs/evals.md).

What is here:

- `run.mjs` runs the paired before and after conditions, and the
  rules-only control with `--control`.
- `drift.mjs` runs a task sequence inside one project.
- `fidelity.mjs` renders both sides and asks a judge model whether the
  fix kept the design intent.
- `report.mjs` and `aggregate-runs.mjs` render one run or summarize
  several.
- `tasks/` holds the temptation and neutral prompts. `fixture/`,
  `fixture-rich/`, and `fixture-ds/` are the projects they run in.
- `scripts/` holds the registry corpus scan and ratchet, the red-team
  verifier, the classifier parity check, and the benchmarks.
- `results/` is where runs land. It is untracked.

GPT models use the signed-in Codex CLI. Use a version with
`exec --ignore-user-config` and `--ephemeral`; set `CODEX_BIN` if it is
not the `codex` on your PATH.

```bash
pnpm build
node packages/evals/run.mjs --model gpt-5.6-terra --reasoning medium --control
node packages/evals/run.mjs --model gpt-5.6-sol --reasoning medium --control
```

Codex runs in temporary project copies with user configuration, project
instructions and skill catalogs excluded, and plugins and other agents
disabled. It may use the shell to read project files and `apply_patch` to
edit them. The generation prompt's no-commands instruction is adapted
to allow file reads; the tasks, rules, and diagnostics are unchanged.
Each call has a five-minute timeout;
Claude's 24-turn limit does not apply to Codex. Results include token
usage and duration; dollar cost is unavailable and recorded as `null`.
