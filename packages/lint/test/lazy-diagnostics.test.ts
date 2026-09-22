import tsParser from "@typescript-eslint/parser"
import { Linter } from "eslint"
import { beforeEach, describe, expect, test, vi } from "vitest"
import vueParser from "vue-eslint-parser"

import { plugin } from "../src/index"
import * as components from "../src/project/components"
import * as theme from "../src/project/theme"
import * as variants from "../src/project/variants"
import { button, PAGE, PROJECT, sfc } from "./helpers"

vi.mock("../src/project/variants", async (importOriginal) => {
  const actual = await importOriginal<typeof variants>()
  return { ...actual, variantNamesFor: vi.fn(actual.variantNamesFor) }
})

vi.mock("../src/project/theme", async (importOriginal) => {
  const actual = await importOriginal<typeof theme>()
  return {
    ...actual,
    colorTokensFor: vi.fn(actual.colorTokensFor),
    colorValuesFor: vi.fn(actual.colorValuesFor),
    spacingBaseFor: vi.fn(actual.spacingBaseFor),
  }
})

vi.mock("../src/project/components", async (importOriginal) => {
  const actual = await importOriginal<typeof components>()
  return { ...actual, componentsFor: vi.fn(actual.componentsFor) }
})

function lint(code: string, rules: Record<string, unknown>) {
  return new Linter({ cwd: PROJECT }).verify(
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
        rules,
      },
    ] as unknown as Linter.Config[],
    { filename: PAGE }
  )
}

beforeEach(() => vi.clearAllMocks())

describe("diagnostic work stays off the clean path", () => {
  test("accepted component classes do not read variants", () => {
    expect(
      lint(sfc(button, `<Button class="w-full mt-4">Go</Button>`), {
        "shadcn-vue/no-restyle": ["error", { allow: ["layout"] }],
      })
    ).toEqual([])
    expect(variants.variantNamesFor).not.toHaveBeenCalled()
  })

  test("the first violation loads variants once, including custom messages", () => {
    const messages = lint(
      sfc(button, `<Button class="w-full bg-red-500 rounded-full">Go</Button>`),
      {
        "shadcn-vue/no-restyle": [
          "error",
          { allow: ["layout"], message: "{{className}}: {{variants}}" },
        ],
      }
    )
    expect(messages).toHaveLength(2)
    expect(messages[0].message).toContain(
      "bg-red-500: default, outline, secondary, ghost, destructive, link"
    )
    expect(messages[1].message).toContain(
      "rounded-full: default, outline, secondary, ghost, destructive, link"
    )
    expect(variants.variantNamesFor).toHaveBeenCalledTimes(1)
  })

  test("allowed arbitrary values do not read the spacing unit", () => {
    expect(
      lint(sfc("", `<div class="w-[13px] p-4" />`), {
        "shadcn-vue/no-arbitrary-values": ["error", { allow: ["layout"] }],
      })
    ).toEqual([])
    expect(theme.spacingBaseFor).not.toHaveBeenCalled()
  })

  test("spacing suggestions share the unit and preserve exact fixes", () => {
    const messages = lint(sfc("", `<div class="p-[12px] m-[16px]" />`), {
      "shadcn-vue/no-arbitrary-values": "error",
    })
    expect(
      messages.map((message) => message.suggestions?.[0].fix.text)
    ).toEqual(['"p-3 m-[16px]"', '"p-[12px] m-4"'])
    expect(theme.spacingBaseFor).toHaveBeenCalledTimes(1)
  })

  test("declared colors do not resolve suggestion values", () => {
    expect(
      lint(sfc("", `<div class="bg-primary w-full text-foreground" />`), {
        "shadcn-vue/no-raw-colors": "error",
      })
    ).toEqual([])
    expect(theme.colorValuesFor).not.toHaveBeenCalled()
  })

  test("files without class sites skip variant and color reads", () => {
    expect(
      lint(sfc("", `<svg fill="currentColor" />`), {
        "shadcn-vue/no-restyle": "error",
        "shadcn-vue/no-raw-colors": "error",
      })
    ).toEqual([])
    // The file has no class site, so no component is resolved and the
    // project index is never read; nothing per-component or per-color is
    // read either.
    expect(components.componentsFor).not.toHaveBeenCalled()
    expect(variants.variantNamesFor).not.toHaveBeenCalled()
    expect(theme.colorTokensFor).not.toHaveBeenCalled()
    expect(theme.colorValuesFor).not.toHaveBeenCalled()
  })

  test("SVG color diagnostics still resolve suggestions without a class site", () => {
    const messages = lint(sfc("", `<svg fill="#ffffff" />`), {
      "shadcn-vue/no-raw-colors": "error",
    })
    expect(messages).toHaveLength(1)
    expect(messages[0].messageId).toBe("rawColorAttributeNear")
    expect(theme.colorValuesFor).toHaveBeenCalledTimes(1)
    // The attribute is not a class site, so no component is resolved and
    // the project index is never read.
    expect(components.componentsFor).not.toHaveBeenCalled()
    expect(variants.variantNamesFor).not.toHaveBeenCalled()
  })

  test("a later rule can scan strings after a rule skips the shared tracker", () => {
    const messages = lint(sfc(`const tone = "bg-red-500"`, `<div />`), {
      "shadcn-vue/no-restyle": "error",
      "shadcn-vue/no-raw-colors": ["error", { scanAllStrings: true }],
    })
    expect(messages).toHaveLength(1)
    expect(messages[0].ruleId).toBe("shadcn-vue/no-raw-colors")
    // A scanned string belongs to no component, so no tracker is built
    // and the project index is never read.
    expect(components.componentsFor).not.toHaveBeenCalled()
    expect(variants.variantNamesFor).not.toHaveBeenCalled()
  })

  test("invalid policy still reports on a file without class sites", () => {
    const contracts = [{ pattern: "[" }]
    const messages = lint(sfc("const value = 1", `<div />`), {
      "shadcn-vue/no-restyle": ["error", { contracts }],
      "shadcn-vue/no-arbitrary-values": ["error", { contracts }],
      "shadcn-vue/no-raw-colors": ["error", { contracts }],
    })
    expect(messages).toHaveLength(3)
    for (const message of messages) {
      expect(message.message).toContain("is not a valid regular expression")
    }
  })
})
