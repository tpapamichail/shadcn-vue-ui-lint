import { describe, expect, test } from "vitest"

const { codexResult } = await import(
  new URL("../../evals/lib/codex.mjs", import.meta.url).href
)

function events(...items: unknown[]) {
  return items.map((item) => JSON.stringify(item)).join("\n")
}

describe("Codex eval completion", () => {
  test("records tokens without inventing a dollar cost", () => {
    const usage = {
      input_tokens: 100,
      cached_input_tokens: 50,
      output_tokens: 25,
    }
    expect(codexResult(events({ type: "turn.completed", usage }), 0)).toEqual({
      costUsd: null,
      numTurns: 1,
      isError: false,
      usage,
    })
  })

  test("does not count incomplete or failed calls as successful", () => {
    expect(codexResult(events({ type: "turn.started" }), 0).isError).toBe(true)
    expect(codexResult(events({ type: "turn.completed" }), null).isError).toBe(
      true
    )
    expect(
      codexResult(
        events({ type: "turn.completed" }, { type: "turn.failed" }),
        0
      ).isError
    ).toBe(true)
  })

  test("rejects malformed event output", () => {
    expect(() => codexResult("not json", 0)).toThrow()
  })
})
