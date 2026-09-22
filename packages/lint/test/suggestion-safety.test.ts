import tsParser from "@typescript-eslint/parser"
import { Linter } from "eslint"
import { describe, expect, test } from "vitest"
import vueParser from "vue-eslint-parser"

import { plugin } from "../src/index"
import { cn, PAGE, PROJECT, sfc } from "./helpers"

const linter = new Linter({ cwd: PROJECT })
const config = [
  {
    files: ["**/*.vue"],
    languageOptions: {
      parser: vueParser,
      parserOptions: {
        parser: tsParser,
        sourceType: "module",
        ecmaFeatures: { jsx: false },
      },
    },
    plugins: { "shadcn-vue": plugin },
    rules: {
      "shadcn-vue/no-raw-colors": "error",
      "shadcn-vue/no-arbitrary-values": "error",
    },
  },
] as unknown as Linter.Config[]

// Applies the first suggestion of the first message and re-parses.
const applyFirst = (code: string) => {
  const [message] = linter.verify(code, config, { filename: PAGE })
  const fix = message?.suggestions?.[0]?.fix
  if (!fix) return { fixed: null, messages: [] }
  const fixed =
    code.slice(0, fix.range[0]) + fix.text + code.slice(fix.range[1])
  return { fixed, messages: linter.verify(fixed, config, { filename: PAGE }) }
}

describe("editor suggestions keep the source valid", () => {
  test("entities and real newlines survive", () => {
    const entity = applyFirst(
      sfc("", `<div class="bg-zinc-100 before:content-[&quot;x&quot;]" />`)
    )
    expect(entity.fixed).toBe(
      sfc("", `<div class="bg-muted before:content-[&quot;x&quot;]" />`)
    )
    expect(entity.messages.some((m) => m.fatal)).toBe(false)

    const newline = applyFirst(sfc("", `<div class="bg-zinc-100\n  w-full" />`))
    expect(newline.fixed).toBe(sfc("", `<div class="bg-muted\n  w-full" />`))
    expect(newline.messages).toEqual([])

    const scale = applyFirst(sfc("", `<div class="p-[13px]\n  w-full" />`))
    expect(scale.fixed).toBe(sfc("", `<div class="p-3.25\n  w-full" />`))
  })

  test("a class whose token is not verbatim in the source gets no suggestion rather than a wrong one", () => {
    // The attribute decodes to two classes, but the raw text has no
    // whitespace-delimited `bg-zinc-100` token to replace.
    const [message] = linter.verify(
      sfc("", `<div class="bg-zinc-100&#32;w-full" />`),
      config,
      { filename: PAGE }
    )
    expect(message.suggestions ?? []).toEqual([])
  })

  test("a JavaScript string keeps its quotes", () => {
    const { fixed } = applyFirst(
      sfc(`${cn}\nexport const c = cn('bg-zinc-100', "w-full")`, `<div />`)
    )
    expect(fixed).toBe(
      sfc(`${cn}\nexport const c = cn('bg-muted', "w-full")`, `<div />`)
    )
  })
})

describe("escaped strings", () => {
  test("a line continuation disables suggestions on the string", () => {
    const messages = linter.verify(
      sfc("", `<div :class="'hover:\\\nbg-zinc-100 bg-zinc-100'" />`),
      [
        {
          ...config[0],
          rules: { "shadcn-vue/no-raw-colors": "error" },
        },
      ] as unknown as Linter.Config[],
      { filename: PAGE }
    )
    expect(messages).toHaveLength(2)
    for (const m of messages) expect(m.suggestions ?? []).toEqual([])
  })
})
