# Evals

The evals measure how agents style UI before and after `@shadcn/lint`
feedback: how far they drift from the design system, where the fix lands,
and whether the requested look survives. The harness lives in
[packages/evals](../packages/evals). Every number below comes from a
dated run whose id is listed at the [end of this page](#run-ids). These
are measurements of specific runs, not promises for every model or
project.

## What the evals show

**Without the linter, every model drifts.** Given eight prompts that ask
for off-system styling, Sonnet 5 produces roughly 50 to 80 findings,
Haiku 4.5 about the same, and Opus 5 around 40. Given neutral prompts
with no styling language at all, agents still restyle the components
they were handed on most tasks. The models are not bad at styling. They
give you exactly what you asked for, and what you asked for is not in
the system.

**With the linter, every model reaches zero.** Across more than 150 task
runs, the count after feedback is zero on all but two, and those two were
linter bugs fixed the same day. Almost every task converges in one round.
No model ever used an `eslint-disable` comment, an inline style, or a
`<style>` element to get there. The fix usually lands where you would want
it, as a variant on the component:

```tsx
<Button className="bg-[#FF6B35] text-white hover:bg-[#FF6B35]/90">
  Subscribe
</Button>
```

becomes a declared brand token, a `brand` variant on `Button`, and:

```tsx
<Button variant="brand">Subscribe</Button>
```

**Diagnostics matter most for weaker models.** Handed the rules text and
asked to review its own work, Opus fixes everything, Sonnet fixes
everything with an extra round and two timeouts, and Haiku leaves one
task broken after three tries. With diagnostics, all three converge in
one round, at 10% to 48% lower correction cost. The linter's value is
that the outcome is automatic, verified, and cheap, not that a strong
model could not get there if someone pasted the rules into every prompt.

**The look survives.** A judge model scores nearly every before and after
pair 9 or 10 out of 10. No judged run reached green by styling less.

## How a run works

Each task runs as a pair of fresh, context-free agents in an isolated
copy of a small shadcn project.

- **Before.** The agent generates the component. No linter anywhere.
- **After.** A new agent starts from that exact output and receives the
  task, the rule descriptions, and the linter's diagnostics, for up to
  three correction rounds.
- **Rules only.** The control. Same starting output, same rules text,
  same three rounds, no diagnostics. The agent is asked to review its own
  file. A hidden lint check decides whether it gets another round.

The after condition gets more turns than the before condition, so the
before and after gap measures the whole correction step. The control is
what isolates the diagnostics.

**Temptation tasks** ask for styling outside the system: a pink button,
13px padding, "make it pop". **Neutral tasks** ask for pages with no
styling instructions: a settings page, an invoices table, a sign-in
form.

Each corrected task gets one outcome. `variant-added` means the styling
landed in the component's own API. `within-system` means an existing
variant or token was enough. `ui-modified` means the component changed in
some other way, usually a typed prop instead of a `cva` variant, which
the classifier does not credit. `inline-style`, `style-element`,
`ignore-comment`, and `non-convergent` are the failure labels.

For fidelity, the harness renders both sides with Playwright and a judge
model scores whether the fix kept the task's stated intent, three passes,
median reported. Snapping a value to the nearest token counts as intent
preserved. Lint success and fidelity are reported separately.

## Temptation suite

| Model     | Runs | Before per run | After | Tasks green | One round | Cost per run |
| --------- | ---- | -------------- | ----- | ----------- | --------- | ------------ |
| Sonnet 5  | 5    | 70 (63–84)     | 0     | 40/40       | 38/40     | $3.78–$5.17  |
| Sonnet 5  | 2    | 52, 55         | 0     | 16/16       | 16/16     | $3.59, $3.84 |
| Haiku 4.5 | 2    | 62, 72         | 2, 0  | 15/16       | 12/16     | $1.67, $1.71 |
| Opus 5    | 2    | 8, 43          | 0     | 16/16       | 16/16     | $5.67, $8.44 |

Cost is the whole run: generation plus correction for eight tasks.
Earlier runs from 2026-09-02 told the agent not to use suppressions or
inline styles. Every run above drops that sentence, so the zero
workaround counts measure the linter alone.

The two Haiku misses came from three linter gaps, fixed the same day and
covered by tests. One task used a v3 gradient class that was read as an
undeclared color. The other passed a raw color through a lookup table
and a custom property. Both tasks used a `<style jsx>` block no rule
could see.

Opus is the outlier on the before side. One run produced 8 findings with
five of eight tasks clean before any feedback. Run 2 produced 43 and
the control run's generation produced 42, so around 40 is typical, well
under Sonnet. On the after side it matches the other models.

### Rules only versus diagnostics

One control run per model. Rounds are the mean over tasks that needed a
fix. Cost is correction spend only.

|                                   | Sonnet 5 | Haiku 4.5 | Opus 5 |
| --------------------------------- | -------- | --------- | ------ |
| Tasks green, rules only           | 8/8      | 7/8       | 8/8    |
| Tasks green, with diagnostics     | 8/8      | 8/8       | 8/8    |
| Rounds, rules only                | 1.25     | 1.57      | 1.00   |
| Rounds, with diagnostics          | 1.00     | 1.00      | 1.00   |
| Correction cost, rules only       | $3.57    | $1.41     | $4.35  |
| Correction cost, with diagnostics | $2.47    | $0.74     | $3.93  |

Haiku's miss is the instructive one. It declared a font-size token in the
wrong namespace, used it as `text-stats-label`, and spent three
self-reviews without finding the failing class. Given the diagnostic
naming it, it fixed the same file in one round.

### Visual fidelity

| Run                   | Preserved | Scores | Note                                  |
| --------------------- | --------- | ------ | ------------------------------------- |
| Sonnet 5, 2026-09-02  | 8/8       | 7–10   | Scores below 9 were token snapping    |
| Sonnet 5, 2026-09-04  | 8/8       | 9–10   | Unanimous across passes               |
| Haiku 4.5, 2026-09-04 | 7/8       | 9–10   | One pair rendered empty on both sides |
| Opus 5, 2026-09-10    | 7/8       | 9–10   | One pair rendered empty on both sides |

The two unjudgeable pairs are a harness limit, not a design loss: the
component exported no page or content, so both sides rendered an empty
box. New tokens and variants still need human review. A passing lint
result does not approve the design.

## Neutral tasks

Eight assembly tasks with no styling language, against the eleven
components a fresh `shadcn init` ships.

| Model     | Before | Clean before | After | Tasks green | Rounds |
| --------- | ------ | ------------ | ----- | ----------- | ------ |
| Sonnet 5  | 14     | 3/8          | 0     | 8/8         | 1      |
| Haiku 4.5 | 21     | 2/8          | 0     | 8/8         | 1      |

All 35 findings were appearance classes passed to a component from
outside. With a complete vocabulary the agent does not invent values; it
restyles the components it was given. Sonnet's fidelity was 8/8 at a
unanimous 10.

The same tasks on the same components moved to `ds/`, with no
`components.json` and nothing generated by the CLI, reached zero on 8/8
with the rules pointed at the components by an import pattern. The plain
Tailwind layout was not worse on any measure. This verifies one
alternative layout, not every setup.

## Drift over time

The eight neutral tasks run in sequence inside one project, the way a
week of work goes. Sonnet 5, three sequences. The unenforced project ends
with 18 to 23 findings and a vocabulary that never grew. The enforced
project ends at zero every time, with more variants than it started
with, and no workaround in any of the 24 enforced tasks.

First drafts did not get cleaner as variants accumulated. Drift before
feedback was the same with or without enforcement and depended on the
task, not on the project's history. The benefit is a clean project at the
end, at up to one extra round per task.

## Red-team

Seven adversarial sandboxes, relinted on 2026-09-04 under the README
configuration.

| Strategy                              | Result  |
| ------------------------------------- | ------- |
| Raw hex through a CSS custom property | caught  |
| Raw CSS class in `globals.css`        | escaped |
| Minting a new theme token             | escaped |
| Dynamic class string in a variable    | caught  |
| SVG `fill` attribute                  | caught  |
| Re-exporting a ui component elsewhere | caught  |
| All of the above combined             | caught  |

The two escapes are outside JSX. Plain CSS is a CSS linter's job, and a
new theme token is on-system by definition. See
[what it cannot see](./how-it-works.md#what-it-cannot-see). This was a
bounded search, not proof that no other bypass exists.

## The registry

A registry snapshot, 485 files at the pinned ref, is scanned on every
release and the build fails if any rule's count rises above the
[baseline](../packages/evals/scripts/corpus-baseline.json), 602 findings
today, 534 of them `no-restyle`. Those are accepted counts for that
snapshot, not expected counts for an application. See
[the registry corpus](../CONTRIBUTING.md#the-registry-corpus) for the
update process.

## Limitations

- Results cover Sonnet 5, Haiku 4.5, and Opus 5, all from one model
  family, and the judge is from the same family. A cross-family judge
  would be a more independent check.
- Most runs hand diagnostics straight to the agent. They do not measure
  every editor or agent integration.
- Corrections add work and cost, and drift runs did not improve first
  drafts.
- The outcome classifier credits only `cva` and `tv` variants, so a typed
  prop with `data-[variant=...]` classes shows as `ui-modified`. It also
  labels every `style` attribute, including the sanctioned
  custom-property form. Read the file before calling either a cheat.
- Rules and prompts changed between measurements. The runs before
  2026-09-05 could not tell a timeout after a successful fix from a
  failure; later runs count an agent error as a finding and retry.

## Reproduce

Run from the repository root with the `claude` CLI installed and signed
in. Every run makes paid model calls. A paired temptation run costs
roughly $2 with Haiku 4.5, $4 to $5 with Sonnet 5, and $6 to $9 with
Opus 5. A control run adds roughly half again.

```bash
pnpm build
node packages/evals/run.mjs --model claude-sonnet-5
```

Add `--control` for the rules-only comparison, `--tasks
packages/evals/tasks/neutral.json --fixture fixture-rich` for the neutral
tasks, `--fixture fixture-ds` for the plain Tailwind layout, and
`--forbid-workarounds` to reproduce the pre-2026-09-04 prompts.

Score fidelity and render a report for an existing run:

```bash
node packages/evals/fidelity.mjs packages/evals/results/<run-id>/results.json
node packages/evals/report.mjs packages/evals/results/<run-id>/results.json
```

Aggregate several runs into means and ranges, or run the neutral tasks in
sequence inside one project:

```bash
node packages/evals/aggregate-runs.mjs <run-id> [run-id ...]
node packages/evals/drift.mjs --model claude-sonnet-5
```

`pnpm corpus:check` scans the pinned registry without any model calls.

## Run ids

Runs are written to `packages/evals/results/`, which is untracked.

Temptation, Sonnet 5, 2026-09-06: `run-2026-09-06T12-48-53-389Z`,
`run-2026-09-06T13-13-19-534Z`, `run-2026-09-06T13-41-19-306Z`,
`run-2026-09-06T13-59-29-381Z`, `run-2026-09-06T14-19-24-473Z`.
2026-09-04: `run-2026-09-04T06-41-32-849Z`, `run-2026-09-04T07-16-19-158Z`.
2026-09-02, with the workaround instruction: `run-2026-09-02T09-53-13-651Z`,
`run-2026-09-02T10-14-58-070Z`, `run-2026-09-02T10-38-45-691Z`,
`run-2026-09-02T11-00-46-230Z`, `run-2026-09-02T11-22-49-219Z`.

Temptation, Haiku 4.5, 2026-09-04: `run-2026-09-04T06-57-59-750Z`,
`run-2026-09-04T07-32-57-901Z`. 2026-09-02, with the workaround
instruction: `run-2026-09-02T18-08-24-734Z`, `run-2026-09-02T18-25-20-419Z`.

Temptation, Opus 5, 2026-09-10: `run-2026-09-10T13-51-41-789Z`,
`run-2026-09-10T14-04-33-962Z`.

Controls: `run-2026-09-05T14-33-17-795Z` (Sonnet 5),
`run-2026-09-10T13-20-26-567Z` (Haiku 4.5),
`run-2026-09-10T14-26-55-150Z` (Opus 5).

Neutral, 2026-09-04: `run-2026-09-04T08-14-20-562Z` (Sonnet 5),
`run-2026-09-04T08-29-28-857Z` (Haiku 4.5). Plain Tailwind layout,
2026-09-07: `run-2026-09-07T08-40-07-753Z` (`fixture-ds`),
`run-2026-09-07T09-02-27-789Z` (`fixture-rich`).

Drift, 2026-09-04: `drift-2026-09-04T08-47-27-786Z`,
`drift-2026-09-04T12-01-51-491Z`, `drift-2026-09-04T12-27-59-761Z`.
