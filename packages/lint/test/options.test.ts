// Option semantics shared across rules: the layout contract keyword,
// allow entries with contract normalization, scanAllStrings, SVG color
// attributes, and the unknown-group guard.

import { defaultConfig, mergeConfigs } from "cn/config"
import { describe, expect, test } from "vitest"

import { groupOf, unknownGroups } from "../src/grammar/classifier"
import { noArbitraryValues } from "../src/rules/no-arbitrary-values"
import { isRawColorValue, noRawColors } from "../src/rules/no-raw-colors"
import { noRestyle } from "../src/rules/no-restyle"
import { button, card, createTester, PAGE, sfc, template } from "./helpers"

const tester = createTester()

describe("layout keyword", () => {
  test("allow: [layout] keeps placement and rejects appearance", () => {
    const options = [
      { contracts: [{ pattern: "^CardContent$", allow: ["layout"] }] },
    ]
    tester.run("no-restyle", noRestyle as any, {
      valid: [
        {
          filename: PAGE,
          code: sfc(
            card,
            `<CardContent class="mt-4 w-full hidden">Hi</CardContent>`
          ),
          options,
        },
      ],
      invalid: [
        {
          filename: PAGE,
          code: sfc(card, `<CardContent class="px-2">Hi</CardContent>`),
          options,
          errors: [{ messageId: "spacingClassNoSizes" }],
        },
        // The keyword opens layout only where it is written: a component
        // the contract does not name has no allow list at all.
        {
          filename: PAGE,
          code: sfc(card, `<CardTitle class="mt-4">Hi</CardTitle>`),
          options,
          errors: [{ messageId: "layoutClassClosed" }],
        },
      ],
    })
  })
})

describe("allow with contract normalization", () => {
  test("no-raw-colors: variants, opacity, globs", () => {
    tester.run("no-raw-colors", noRawColors as any, {
      valid: [
        {
          filename: PAGE,
          code: template(
            `<div class="bg-amber-100 hover:bg-amber-100 bg-amber-100/50 dark:bg-amber-200" />`
          ),
          options: [{ allow: ["bg-amber-1*", "bg-amber-200"] }],
        },
      ],
      invalid: [
        {
          filename: PAGE,
          code: template(`<div class="bg-amber-300" />`),
          options: [{ allow: ["bg-amber-100"] }],
          errors: [{ messageId: "paletteClassFar" }],
        },
      ],
    })
  })

  test("no-arbitrary-values: an allowed value covers its variants", () => {
    tester.run("no-arbitrary-values", noArbitraryValues as any, {
      valid: [
        {
          filename: PAGE,
          code: template(`<div class="md:p-[13px] p-[13px]/50" />`),
          options: [{ allow: ["p-[13px]"] }],
        },
      ],
      invalid: [],
    })
  })
})

describe("scanAllStrings", () => {
  test("bare string literals are checked", () => {
    const code = sfc(
      `const tone = "bg-pink-500"`,
      `<div :data-tone="tone" />`
    )
    tester.run("no-raw-colors", noRawColors as any, {
      valid: [
        {
          filename: PAGE,
          code,
        },
      ],
      invalid: [
        {
          filename: PAGE,
          code,
          options: [{ scanAllStrings: true }],
          errors: [{ messageId: "paletteClassFar" }],
        },
      ],
    })
  })
})

describe("SVG presentation attributes", () => {
  test("isRawColorValue", () => {
    expect(isRawColorValue("#ff00aa")).toBe(true)
    expect(isRawColorValue("rgb(1 2 3)")).toBe(true)
    expect(isRawColorValue("red")).toBe(true)
    expect(isRawColorValue("currentColor")).toBe(false)
    expect(isRawColorValue("none")).toBe(false)
    expect(isRawColorValue("var(--color-brand)")).toBe(false)
    expect(isRawColorValue("url(#gradient)")).toBe(false)
  })

  test("fill and stroke with raw colors are flagged", () => {
    tester.run("no-raw-colors", noRawColors as any, {
      valid: [
        {
          filename: PAGE,
          code: template(
            `<svg><path fill="currentColor" stroke="none" /></svg>`
          ),
        },
        {
          filename: PAGE,
          code: template(`<svg><path fill="var(--color-brand)" /></svg>`),
        },
        {
          filename: PAGE,
          code: template(`<svg><path :fill="color" /></svg>`),
        },
      ],
      invalid: [
        {
          filename: PAGE,
          code: template(
            `<svg><path fill="#ff00aa" :stroke="'red'" /></svg>`
          ),
          errors: [
            {
              messageId: "rawColorAttribute",
              data: { attribute: "fill", value: "#ff00aa" },
            },
            {
              messageId: "rawColorAttributeNear",
              data: {
                attribute: "stroke",
                value: "red",
                suggestion: "destructive",
              },
            },
          ],
        },
      ],
    })
  })
})

describe("unknown class groups", () => {
  test("every bundled group has a category; a new one is reported", () => {
    expect(unknownGroups(defaultConfig())).toEqual([])
    const extended = mergeConfigs(defaultConfig(), {
      extend: { classGroups: { "future-thing": ["future"] } },
    })
    expect(unknownGroups(extended)).toEqual(["future-thing"])
  })
})

describe("geometry is an arbitrary value too", () => {
  test("w-[320px] is an error until layout is allowed", () => {
    tester.run("no-arbitrary-values", noArbitraryValues as any, {
      valid: [
        {
          filename: PAGE,
          code: sfc(button, `<Button class="w-[320px]">Go</Button>`),
          options: [{ allow: ["layout"] }],
        },
      ],
      invalid: [
        {
          filename: PAGE,
          code: sfc(button, `<Button class="w-[320px]">Go</Button>`),
          errors: [
            {
              messageId: "arbitraryValueWithScale",
              data: { className: "w-[320px]", replacement: "w-80" },
              suggestions: [
                {
                  messageId: "useScale",
                  data: { replacement: "w-80" },
                  output: sfc(button, `<Button class="w-80">Go</Button>`),
                },
              ],
            },
          ],
        },
      ],
    })
  })
})

describe("legacy gradient direction utilities", () => {
  test("bg-gradient-to-* is an image, not an undeclared color", () => {
    expect(groupOf("bg-gradient-to-b")).toBe("bg-image")
    expect(groupOf("bg-linear-to-r")).toBe("bg-image")
    tester.run("no-raw-colors", noRawColors as any, {
      valid: [
        {
          filename: PAGE,
          code: template(
            `<div class="bg-gradient-to-b from-primary to-transparent" />`
          ),
        },
      ],
      invalid: [],
    })
  })
})
