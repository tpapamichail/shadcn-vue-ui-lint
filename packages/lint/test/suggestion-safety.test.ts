import parser from "@typescript-eslint/parser"
import { Linter } from "eslint"
import { describe, expect, test } from "vitest"

import { plugin } from "../src/index"
import { cn, PAGE, PROJECT } from "./helpers"

const lint = (code: string, rules: Record<string, unknown>) =>
  new Linter({ cwd: PROJECT }).verify(
    code,
    [
      {
        files: ["**/*.tsx"],
        languageOptions: {
          parser,
          parserOptions: { ecmaFeatures: { jsx: true } },
        },
        plugins: { shadcn: plugin },
        rules,
      },
    ] as any,
    { filename: PAGE }
  )

describe("editor suggestions keep the source valid", () => {
  const linter = new Linter({ cwd: PROJECT })
  const config = [
    {
      files: ["**/*.tsx"],
      languageOptions: {
        parser,
        parserOptions: { ecmaFeatures: { jsx: true } },
      },
      plugins: { shadcn: plugin },
      rules: {
        "shadcn/no-raw-colors": "error",
        "shadcn/no-arbitrary-values": "error",
      },
    },
  ] as any

  // Applies the first suggestion of the first message and re-parses.
  const applyFirst = (code: string) => {
    const [message] = linter.verify(code, config, { filename: PAGE })
    const fix = message?.suggestions?.[0]?.fix
    if (!fix) return { fixed: null, messages: [] }
    const fixed =
      code.slice(0, fix.range[0]) + fix.text + code.slice(fix.range[1])
    return { fixed, messages: linter.verify(fixed, config, { filename: PAGE }) }
  }

  test("JSX entities and real newlines survive", () => {
    const entity = applyFirst(
      `export const A = () => <div className="bg-zinc-100 before:content-[&quot;x&quot;]" />`
    )
    expect(entity.fixed).toBe(
      `export const A = () => <div className="bg-muted before:content-[&quot;x&quot;]" />`
    )
    expect(entity.messages.some((m) => m.fatal)).toBe(false)

    const newline = applyFirst(
      `export const A = () => <div className="bg-zinc-100\n  w-full" />`
    )
    expect(newline.fixed).toBe(
      `export const A = () => <div className="bg-muted\n  w-full" />`
    )
    expect(newline.messages).toEqual([])

    const scale = applyFirst(
      `export const A = () => <div className="p-[13px]\n  w-full" />`
    )
    expect(scale.fixed).toBe(
      `export const A = () => <div className="p-3.25\n  w-full" />`
    )
  })

  test("a class written with an entity gets no suggestion rather than a wrong one", () => {
    const [message] = linter.verify(
      `export const A = () => <div className="bg-zinc-100&#32;w-full" />`,
      config,
      { filename: PAGE }
    )
    expect(message.suggestions ?? []).toEqual([])
  })

  test("a JavaScript string keeps its quotes", () => {
    const { fixed } = applyFirst(
      `${cn}\nexport const c = cn('bg-zinc-100', "w-full")`
    )
    expect(fixed).toBe(`${cn}\nexport const c = cn('bg-muted', "w-full")`)
  })
})

describe("escaped strings", () => {
  test("a line continuation disables suggestions on the string", () => {
    const messages = lint(
      `export const A = () => <div className={"hover:\\\nbg-zinc-100 bg-zinc-100"} />`,
      { "shadcn/no-raw-colors": "error" }
    )
    expect(messages).toHaveLength(2)
    for (const m of messages) expect(m.suggestions ?? []).toEqual([])
  })
})
