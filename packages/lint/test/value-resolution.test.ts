import tsParser from "@typescript-eslint/parser"
import { Linter } from "eslint"
import { describe, expect, test } from "vitest"
import vueParser from "vue-eslint-parser"

import { plugin } from "../src/index"
import { button, cn, PAGE, PROJECT, sfc } from "./helpers"

// Every case is a page of the fixture project, so components.json,
// the theme, and the ui components resolve.
const page = (script: string, markup: string) =>
  sfc(`${button}\n${cn}\n${script}`, markup)

function expectReports(
  code: string,
  expected: { rule: string; messageId: string; at: string; last?: boolean }[]
) {
  const messages = new Linter({ cwd: PROJECT }).verify(
    code,
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
        "shadcn-vue/no-restyle": "error",
        "shadcn-vue/require-static-classes": "error",
        "shadcn-vue/no-inline-styles": "error",
        "shadcn-vue/no-raw-colors": "error",
      },
    },
    { filename: PAGE }
  )
  function offset(line: number, column: number) {
    const previousLines = code.split("\n").slice(0, line - 1)
    return (
      previousLines.reduce((total, text) => total + text.length + 1, 0) +
      column -
      1
    )
  }
  const actual = messages.map((message) => ({
    rule: message.ruleId,
    messageId: message.messageId,
    range: [
      offset(message.line, message.column),
      offset(message.endLine!, message.endColumn!),
    ],
  }))
  const reports = expected.map(({ rule, messageId, at, last }) => {
    const start = last ? code.lastIndexOf(at) : code.indexOf(at)
    expect(start).toBeGreaterThanOrEqual(0)
    return {
      rule: `shadcn-vue/${rule}`,
      messageId,
      range: [start, start + at.length],
    }
  })
  function compare(a: unknown, b: unknown) {
    return JSON.stringify(a).localeCompare(JSON.stringify(b))
  }
  expect(actual.sort(compare)).toEqual(reports.sort(compare))
}

describe("shared value resolution preserves rule policy", () => {
  test("destructured fallbacks are authored alternatives", () => {
    const code = page(
      `const { class: classes = "bg-red-500", style: inline = { color: "red" } } = defineProps<{ class?: string; style?: string }>()`,
      `<Button :class="classes" :style="inline" />`
    )
    expectReports(code, [
      {
        rule: "no-restyle",
        messageId: "appearanceClassWithVariants",
        at: '"bg-red-500"',
      },
      {
        rule: "no-raw-colors",
        messageId: "paletteClassNear",
        at: '"bg-red-500"',
      },
      { rule: "no-inline-styles", messageId: "inlineStyle", at: '"red"' },
    ])
  })

  test("default-object values are authored alternatives", () => {
    const code = page(
      `const props = defineProps({ class: { default: "rounded-full" }, style: { default: { padding: 4 } } })`,
      `<Button :class="props.class" :style="props.style" />`
    )
    expectReports(code, [
      {
        rule: "no-restyle",
        messageId: "appearanceClassWithVariants",
        at: '"rounded-full"',
      },
      { rule: "no-inline-styles", messageId: "inlineStyle", at: "4" },
    ])
  })

  test("unknown default objects retain each rule's reporting node after local fallbacks", () => {
    // One member of the default object is unknown: the readable class
    // keeps its literal's node, the unknown style its own.
    const code = page(
      `const props = defineProps({ class: { default: "bg-red-500" }, style: { default: build() } })`,
      `<Button :class="props.class" :style="props.style" />`
    )
    expectReports(code, [
      {
        rule: "no-restyle",
        messageId: "appearanceClassWithVariants",
        at: '"bg-red-500"',
      },
      {
        rule: "no-raw-colors",
        messageId: "paletteClassNear",
        at: '"bg-red-500"',
      },
      {
        rule: "no-inline-styles",
        messageId: "dynamicStyle",
        at: "props.style",
      },
    ])
  })

  test("a readable default object with missing properties has no authored value", () => {
    expectReports(
      page(
        `const props = defineProps({})`,
        `<Button :class="props.class" :style="props.style" />`
      ),
      []
    )
  })

  test("empty member keys stay unreadable for classes and readable for styles", () => {
    const code = page(
      `const classes = { "": "bg-red-500" }\nconst styles = { "": { color: "red" } }`,
      `<Button :class="classes['']" :style="styles['']" />`
    )
    expectReports(code, [
      {
        rule: "require-static-classes",
        messageId: "dynamicClasses",
        at: "classes['']",
      },
      { rule: "no-inline-styles", messageId: "inlineStyle", at: '"red"' },
    ])
  })

  test("unknown member overwrites retain the member expression as the report site", () => {
    const code = page(
      `const theme = { class: "w-full", style: { "--gap": "4px" }, ...opaque }`,
      `<Button :class="theme.class" :style="theme.style" />`
    )
    expectReports(code, [
      {
        rule: "require-static-classes",
        messageId: "dynamicClasses",
        at: "theme.class",
      },
      {
        rule: "no-inline-styles",
        messageId: "dynamicStyle",
        at: "theme.style",
      },
    ])
  })

  test("computed keys and wrapped member receivers retain the final value's node", () => {
    const code = page(
      `const theme = { ...{ class: "bg-red-500", style: { color: "red" } } }`,
      `<Button :class="(theme as object)[\`class\`]" :style="(theme satisfies object)['style']" />`
    )
    expectReports(code, [
      {
        rule: "no-restyle",
        messageId: "appearanceClassWithVariants",
        at: '"bg-red-500"',
      },
      {
        rule: "no-raw-colors",
        messageId: "paletteClassNear",
        at: '"bg-red-500"',
      },
      { rule: "no-inline-styles", messageId: "inlineStyle", at: '"red"' },
    ])
  })

  test("a wrapped member receiver leaves the helper's vocabulary at the call", () => {
    // The cn() call is a site of its own and owns the vocabulary check.
    // The attribute that reads it through a cast judges the boundary
    // and does not report the palette class a second time.
    const code = page(
      `const theme = { class: cn("bg-red-500") }`,
      `<Button :class="(theme as object).class" />`
    )
    expectReports(code, [
      {
        rule: "no-restyle",
        messageId: "appearanceClassWithVariants",
        at: '"bg-red-500"',
      },
      {
        rule: "no-raw-colors",
        messageId: "paletteClassNear",
        at: '"bg-red-500"',
      },
    ])
  })

  test("forwarded defaults revisited on the active path retain rule-specific treatment", () => {
    const code = page(
      `const { class: className = className, style: style = style } = defineProps<{ class?: string; style?: string }>()`,
      `<Button :class="className" :style="style" />`
    )
    expectReports(code, [
      {
        rule: "no-inline-styles",
        messageId: "dynamicStyle",
        at: "style",
        last: true,
      },
    ])
  })
})
