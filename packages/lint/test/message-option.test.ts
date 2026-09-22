// Every vocabulary rule takes a `message`: one string that replaces the
// rule's text on all of its findings, interpolated from the universal
// slots (className, property, component, suggestions, file) and the
// finding's own data. The note still trails; placeholder typos warn.

import tsParser from "@typescript-eslint/parser"
import { Linter } from "eslint"
import { afterEach, beforeEach, describe, expect, test } from "vitest"
import vueParser from "vue-eslint-parser"

import { plugin } from "../src/index"
import { resetWarnings, setWarningSink } from "../src/project/warn"
import { button, PAGE, PROJECT, sfc, template } from "./helpers"

const NOTE = "See DESIGN.md."
const warnings: string[] = []
beforeEach(() => {
  warnings.length = 0
  resetWarnings()
  setWarningSink((m) => warnings.push(m))
})
afterEach(() => setWarningSink((m) => console.warn(m)))

const linter = new Linter({ cwd: PROJECT })
function messages(
  rule: string,
  code: string,
  message: string,
  settings?: object
) {
  return linter
    .verify(
      code,
      [
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
          ...(settings ? { settings } : {}),
          rules: { [`shadcn-vue/${rule}`]: ["error", { message }] },
        },
      ] as any,
      { filename: PAGE }
    )
    .map((m) => m.message)
}

describe("the message option", () => {
  test("no-raw-colors: {{className}}, {{suggestions}} from a spelling fix, {{file}}", () => {
    expect(
      messages(
        "no-raw-colors",
        template(`<div class="bg-primry" />`),
        "{{className}} is not a token. Did you mean {{suggestions|nothing}}? Tokens live in {{file}}."
      )
    ).toEqual([
      "bg-primry is not a token. Did you mean bg-primary? Tokens live in app/globals.css.",
    ])
  })

  test("no-raw-colors: an SVG attribute is {{className}}", () => {
    expect(
      messages(
        "no-raw-colors",
        template(`<svg><path fill="#ff00aa" /></svg>`),
        "{{className}} is a raw color on SVG."
      )
    ).toEqual(['fill="#ff00aa" is a raw color on SVG.'])
  })

  test("no-arbitrary-values: the scale value is {{suggestions}}", () => {
    expect(
      messages(
        "no-arbitrary-values",
        template(`<div class="p-[13px]" />`),
        '"{{className}}" is off the scale. Use {{suggestions|a scale value}}.'
      )
    ).toEqual(['"p-[13px]" is off the scale. Use p-3.25.'])
  })

  test("no-inline-styles: {{property}}, the element as {{component}}, the note trailing", () => {
    const text =
      "No style attribute on <{{component|elements}}>. {{property}} is a class."
    expect(
      messages(
        "no-inline-styles",
        sfc(button, `<Button :style="{ color: '#333' }">Go</Button>`),
        text,
        { "shadcn-vue": { note: NOTE } }
      )
    ).toEqual([`No style attribute on <Button>. color is a class. ${NOTE}`])
    expect(
      messages(
        "no-inline-styles",
        template(`<div style="color: #333" />`),
        text
      )
    ).toEqual(["No style attribute on <elements>. color is a class."])
  })

  test("require-static-classes: {{component}}", () => {
    expect(
      messages(
        "require-static-classes",
        sfc(
          `${button}\nconst tone = pickTone()`,
          `<Button :class="tone">Go</Button>`
        ),
        "className on <{{component}}> must be a static string."
      )
    ).toEqual(["className on <Button> must be a static string."])
  })

  test("no-unknown-classes: the spelling fix is {{suggestions}}", () => {
    expect(
      messages(
        "no-unknown-classes",
        template(`<div class="flex-cols" />`),
        '"{{className}}" is not a class Tailwind knows. Did you mean {{suggestions|nothing close}}?'
      )
    ).toEqual([
      '"flex-cols" is not a class Tailwind knows. Did you mean flex-col?',
    ])
  })

  test("a placeholder typo in a rule message warns once, naming the rule, and stays literal", () => {
    expect(
      messages(
        "no-raw-colors",
        template(`<div class="bg-pink-500" />`),
        "Raw: {{classname}} / {{suggestons|none}}."
      )
    ).toEqual(["Raw: {{classname}} / {{suggestons|none}}."])
    const mine = warnings.filter((w) => w.includes("shadcn-vue/no-raw-colors"))
    expect(mine).toHaveLength(2)
    expect(mine.some((w) => w.includes('"{{className}}"'))).toBe(true)
    expect(mine.some((w) => w.includes('"{{suggestions}}"'))).toBe(true)
  })
})
