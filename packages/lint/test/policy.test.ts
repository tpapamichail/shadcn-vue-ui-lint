// Every class rule takes the same policy: `allow` opens part of what
// the rule rejects, `deny` subtracts from it, and a contract replaces
// both for the components its pattern matches. One file checks that
// the three vocabulary rules and no-inline-styles all read it the same
// way no-restyle does.

import tsParser from "@typescript-eslint/parser"
import { Linter } from "eslint"
import { describe, expect, test } from "vitest"
import vueParser from "vue-eslint-parser"

import { plugin } from "../src/index"
import { noArbitraryValues } from "../src/rules/no-arbitrary-values"
import { noInlineStyles } from "../src/rules/no-inline-styles"
import { noRawColors } from "../src/rules/no-raw-colors"
import { noUnknownClasses } from "../src/rules/no-unknown-classes"
import { button, createTester, PAGE, PROJECT, sfc, template } from "./helpers"

const tester = createTester()

describe("no-raw-colors", () => {
  test("allow opens, deny subtracts, a contract replaces both", () => {
    tester.run("no-raw-colors", noRawColors as any, {
      valid: [
        {
          filename: PAGE,
          code: template(`<div class="bg-amber-100" />`),
          options: [{ allow: ["*-amber-*"], deny: ["bg-amber-500"] }],
        },
        // A contract for Badge: an accent the page may not use elsewhere.
        {
          filename: PAGE,
          code: sfc(button, `<Button class="bg-amber-500">Go</Button>`),
          options: [
            { contracts: [{ pattern: "^Button$", allow: ["*-amber-500"] }] },
          ],
        },
      ],
      invalid: [
        // Subtracted by deny.
        {
          filename: PAGE,
          code: template(`<div class="bg-amber-500" />`),
          options: [{ allow: ["*-amber-*"], deny: ["bg-amber-500"] }],
          errors: [{ messageId: "paletteClassFar" }],
        },
        // A raw element is judged by the top-level policy, not the contract.
        {
          filename: PAGE,
          code: template(`<div class="bg-amber-500" />`),
          options: [
            { contracts: [{ pattern: "^Button$", allow: ["*-amber-500"] }] },
          ],
          errors: [{ messageId: "paletteClassFar" }],
        },
        // The contract's words replace the rule's for its components, and
        // {{component}} names the component the class sits on.
        {
          filename: PAGE,
          code: sfc(button, `<Button class="bg-pink-500">Go</Button>`),
          options: [
            {
              contracts: [
                {
                  pattern: "^Button$",
                  allow: ["*-amber-500"],
                  message:
                    "A <{{component}}> takes amber or a token, not {{className}}.",
                },
              ],
            },
          ],
          errors: [
            { message: "A <Button> takes amber or a token, not bg-pink-500." },
          ],
        },
        // deny alone is a denylist: everything else passes.
        {
          filename: PAGE,
          code: template(`<div class="bg-amber-500 bg-pink-500" />`),
          options: [{ deny: ["bg-amber-500"] }],
          errors: [{ messageId: "paletteClassFar" }],
        },
      ],
    })
  })
})

describe("no-arbitrary-values", () => {
  test("everything minus a deny, and a per-component width", () => {
    tester.run("no-arbitrary-values", noArbitraryValues as any, {
      valid: [
        {
          filename: PAGE,
          code: template(`<div class="w-[320px] p-[13px]" />`),
          options: [{ allow: ["*"], deny: ["text-*"] }],
        },
        {
          filename: PAGE,
          code: sfc(button, `<Button class="w-[320px]">Go</Button>`),
          options: [{ contracts: [{ pattern: "^Button$", allow: ["w-*"] }] }],
        },
      ],
      invalid: [
        {
          filename: PAGE,
          code: template(`<div class="text-[13px]" />`),
          options: [{ allow: ["*"], deny: ["text-*"] }],
          errors: [{ messageId: "arbitraryValueNearScale" }],
        },
        {
          filename: PAGE,
          code: template(`<div class="w-[320px]" />`),
          options: [{ contracts: [{ pattern: "^Button$", allow: ["w-*"] }] }],
          errors: [
            {
              messageId: "arbitraryValueWithScale",
              suggestions: [
                {
                  messageId: "useScale",
                  data: { replacement: "w-80" },
                  output: template(`<div class="w-80" />`),
                },
              ],
            },
          ],
        },
      ],
    })
  })
})

describe("no-arbitrary-values messages", () => {
  test("{{component}} and {{file}} are filled on every finding", () => {
    tester.run("no-arbitrary-values", noArbitraryValues as any, {
      valid: [],
      invalid: [
        {
          filename: PAGE,
          code: sfc(button, `<Button class="p-[13px]">Go</Button>`),
          options: [
            {
              message:
                "{{className}} on <{{component}}>: use {{suggestions|the scale}}; tokens live in {{file}}.",
            },
          ],
          errors: [
            {
              message:
                /^p-\[13px\] on <Button>: use p-3\.25; tokens live in .*app\/globals\.css\.$/,
              suggestions: [
                {
                  messageId: "useScale",
                  data: { replacement: "p-3.25" },
                  output: sfc(button, `<Button class="p-3.25">Go</Button>`),
                },
              ],
            },
          ],
        },
        // An important marker keeps its scale replacement, in place.
        {
          filename: PAGE,
          code: template(`<div class="!p-[13px] p-[13px]!" />`),
          errors: [
            {
              messageId: "arbitraryValueWithScale",
              data: { className: "!p-[13px]", replacement: "!p-3.25" },
              suggestions: [
                {
                  messageId: "useScale",
                  data: { replacement: "!p-3.25" },
                  output: template(`<div class="!p-3.25 p-[13px]!" />`),
                },
              ],
            },
            {
              messageId: "arbitraryValueWithScale",
              data: { className: "p-[13px]!", replacement: "p-3.25!" },
              suggestions: [
                {
                  messageId: "useScale",
                  data: { replacement: "p-3.25!" },
                  output: template(`<div class="!p-[13px] p-3.25!" />`),
                },
              ],
            },
          ],
        },
      ],
    })
  })
})

describe("no-unknown-classes", () => {
  test("a library's classes on the one component that renders them", () => {
    tester.run("no-unknown-classes", noUnknownClasses as any, {
      valid: [
        {
          filename: PAGE,
          code: sfc(button, `<Button class="prose prose-sm">Go</Button>`),
          options: [
            {
              contracts: [{ pattern: "^Button$", allow: ["prose", "prose-*"] }],
            },
          ],
        },
        {
          filename: PAGE,
          code: template(`<div class="prose-sm" />`),
          options: [{ allow: ["prose-*"], deny: ["prose-xl"] }],
        },
      ],
      invalid: [
        {
          filename: PAGE,
          code: template(`<div class="prose-xl" />`),
          options: [{ allow: ["prose-*"], deny: ["prose-xl"] }],
          errors: [{ messageId: "unknownClass" }],
        },
        {
          filename: PAGE,
          code: template(`<div class="prose" />`),
          options: [{ contracts: [{ pattern: "^Button$", allow: ["prose"] }] }],
          errors: [{ messageId: "unknownClass" }],
        },
      ],
    })
  })
})

describe("no-inline-styles", () => {
  test("properties: deny subtracts from a glob, a contract is per component", () => {
    tester.run("no-inline-styles", noInlineStyles as any, {
      valid: [
        {
          code: template(`<div :style="{ borderWidth: 2 }" />`),
          options: [{ allow: ["border-*"], deny: ["borderColor"] }],
        },
        {
          code: template(
            '<Motion :style="{ transform: `translateX(${x}px)` }" />'
          ),
          options: [
            { contracts: [{ pattern: "^Motion$", allow: ["transform"] }] },
          ],
        },
      ],
      invalid: [
        {
          code: template(`<div :style="{ borderColor: 'red' }" />`),
          options: [{ allow: ["border-*"], deny: ["borderColor"] }],
          errors: [{ messageId: "inlineStyle" }],
        },
        // The contract names Motion; a div is the top-level policy's.
        {
          code: template(`<div :style="{ transform: 'none' }" />`),
          options: [
            { contracts: [{ pattern: "^Motion$", allow: ["transform"] }] },
          ],
          errors: [{ messageId: "inlineStyle" }],
        },
        {
          code: template(`<Motion :style="{ color: 'red' }" />`),
          options: [
            {
              contracts: [
                {
                  pattern: "^Motion$",
                  allow: ["transform"],
                  message: "Motion animates {{property}}? Only transform.",
                },
              ],
            },
          ],
          errors: [{ message: "Motion animates color? Only transform." }],
        },
        // deny alone is a denylist. The static attribute carries the same
        // declarations as the object form.
        {
          code: template(`<div style="color: red; padding: 4px" />`),
          options: [{ deny: ["color"] }],
          errors: [{ messageId: "inlineStyle", data: { property: "color" } }],
        },
      ],
    })
  })
})

describe("policies across rules", () => {
  test("an omitted allow and an empty allow are different policies", () => {
    // Both rules compile in one process against the same grammar. The
    // first is a denylist, the second allows nothing; a shared cache
    // that keyed both as [] handed the first policy to the second rule.
    const linter = new Linter({ cwd: PROJECT })
    const run = (rules: Record<string, unknown>) =>
      linter
        .verify(
          sfc(button, `<Button class="w-[320px]">Go</Button>`),
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
          ] as any,
          PAGE
        )
        .map((m) => m.ruleId)
    expect(
      run({
        "shadcn-vue/no-restyle": ["error", { deny: ["p-*"] }],
        "shadcn-vue/no-arbitrary-values": [
          "error",
          { allow: [], deny: ["p-*"] },
        ],
      })
    ).toEqual(["shadcn-vue/no-arbitrary-values"])
    expect(
      run({
        "shadcn-vue/no-arbitrary-values": [
          "error",
          { allow: [], deny: ["p-*"] },
        ],
        "shadcn-vue/no-restyle": ["error", { deny: ["p-*"] }],
      })
    ).toEqual(["shadcn-vue/no-arbitrary-values"])
  })
})

describe("no-inline-styles names", () => {
  // React's member tags (<motion.div>) have no Vue equivalent.
  test("custom properties keep their names", () => {
    tester.run("no-inline-styles", noInlineStyles as any, {
      valid: [
        {
          code: template(`<Chart :style="{ '--chart-1': 'red' }" />`),
          options: [{ allow: ["--chart-1"] }],
        },
        {
          code: template(
            `<Chart :style="{ '--chart-1': 'red', '--chart-2': 'blue' }" />`
          ),
          options: [{ allow: ["--chart-*"] }],
        },
      ],
      invalid: [
        // A different custom property is a different variable.
        {
          code: template(`<Chart :style="{ '--chart-color': 'red' }" />`),
          options: [{ allow: ["--chartColor"] }],
          errors: [{ messageId: "customPropColor" }],
        },
        // An unreadable style object gets the component's words.
        {
          code: sfc(`const s = motionStyle()`, `<Motion :style="s" />`),
          options: [
            {
              contracts: [
                {
                  pattern: "^Motion$",
                  message: "Motion takes custom properties only.",
                },
              ],
            },
          ],
          errors: [{ message: "Motion takes custom properties only." }],
        },
      ],
    })
  })
})

describe("no-unknown-classes and layout", () => {
  test("allow: [layout] does not exempt an unclassified name", () => {
    tester.run("no-unknown-classes", noUnknownClasses as any, {
      valid: [
        {
          filename: PAGE,
          code: template(`<div class="mt-4 flex" />`),
          options: [{ allow: ["layout"] }],
        },
      ],
      invalid: [
        {
          filename: PAGE,
          code: template(`<div class="flex-cols" />`),
          options: [{ allow: ["layout"] }],
          errors: [
            {
              messageId: "unknownClassSuggest",
              suggestions: [
                {
                  messageId: "useSuggestion",
                  data: { suggestion: "flex-col" },
                  output: template(`<div class="flex-col" />`),
                },
              ],
            },
          ],
        },
      ],
    })
  })
})
