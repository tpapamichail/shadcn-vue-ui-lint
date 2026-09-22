import tsParser from "@typescript-eslint/parser"
import { Linter } from "eslint"
import { describe, expect, test } from "vitest"
import vueParser from "vue-eslint-parser"

import { plugin } from "../src/index"
import { button, cn, PAGE, PROJECT, sfc } from "./helpers"

const RULES = [
  "no-arbitrary-values",
  "no-raw-colors",
  "no-unknown-classes",
  "no-restyle",
  "require-static-classes",
]
const CLASSES = "bg-red-500 rounded-[13px] flex-cols"

function diagnostics(script: string, markup: string, rules: Linter.RulesRecord) {
  return new Linter({ cwd: PROJECT })
    .verify(
      sfc(`${button}\n${cn}\n${script}`, markup),
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
      { filename: PAGE }
    )
    .map((message) => ({
      ruleId: message.ruleId,
      messageId: message.messageId,
      message: message.message,
      location: [
        message.line,
        message.column,
        message.endLine,
        message.endColumn,
      ],
      suggestions: (message.suggestions ?? []).map((suggestion) => ({
        messageId: suggestion.messageId,
        message: suggestion.desc,
        replacement: suggestion.fix,
      })),
    }))
    .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)))
}

// Every rule takes the same collector options. no-restyle opens layout,
// which does not cover "flex-cols": an unclassified name is its finding
// as well as the unknown-classes rule's, so each restyle site adds one.
function rulesWith(options: Record<string, unknown> = {}) {
  return Object.fromEntries(
    RULES.map((rule) => [
      `shadcn-vue/${rule}`,
      [
        "error",
        rule === "no-restyle" ? { ...options, allow: ["layout"] } : options,
      ],
    ])
  ) as Linter.RulesRecord
}

function expectIndependentRules(
  script: string,
  markup: string,
  rules: Linter.RulesRecord
) {
  const entries = Object.entries(rules)
  const independent = entries
    .flatMap(([rule, value]) => diagnostics(script, markup, { [rule]: value }))
    .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)))
  expect(diagnostics(script, markup, rules)).toEqual(independent)
  expect(diagnostics(script, markup, Object.fromEntries(entries.reverse()))).toEqual(
    independent
  )
  return independent
}

const lint = (script: string, markup: string, rules: Record<string, unknown>) =>
  new Linter({ cwd: PROJECT }).verify(
    sfc(script, markup),
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
    ],
    { filename: PAGE }
  )

describe("class-site diagnostic ownership", () => {
  test.each([
    ["standalone helper", `cn("${CLASSES}")`, `<div />`, 0],
    ["nested standalone helper", `cn(cn("${CLASSES}"))`, `<div />`, 0],
    [
      "nested attribute helper",
      ``,
      `<Button :class="cn(cn('${CLASSES}'))" />`,
      3,
    ],
    [
      "helper referenced by two components",
      `const classes = cn("${CLASSES}")`,
      `<Button :class="classes" /><Button :class="classes" />`,
      6,
    ],
    [
      "nested helper reached through an object member",
      `const classes = { root: cn(cn("${CLASSES}")) }`,
      `<Button :class="classes.root" />`,
      3,
    ],
  ])("%s preserves individual and combined output", (_name, script, markup, restyles) => {
    const messages = expectIndependentRules(
      script as string,
      markup as string,
      rulesWith()
    )
    for (const rule of RULES.slice(0, 3)) {
      expect(
        messages.filter((message) => message.ruleId === `shadcn-vue/${rule}`)
      ).toHaveLength(1)
    }
    expect(
      messages.filter((message) => message.ruleId === "shadcn-vue/no-restyle")
    ).toHaveLength(restyles as number)
    expect(
      messages.filter(
        (message) => message.ruleId === "shadcn-vue/require-static-classes"
      )
    ).toHaveLength(0)
  })

  test("keeps source locations, message text and suggestion replacements", () => {
    expect(
      diagnostics(
        `const classes = cn("${CLASSES}")`,
        `<Button :class="classes" /><Button :class="classes" />`,
        rulesWith()
      )
    ).toMatchInlineSnapshot(`
      [
        {
          "location": [
            4,
            20,
            4,
            57,
          ],
          "message": ""rounded-[13px]" hardcodes an off-token value. Nearest on the scale: rounded-xl (14px), rounded-lg (10px).",
          "messageId": "arbitraryValueNearScale",
          "ruleId": "shadcn-vue/no-arbitrary-values",
          "suggestions": [],
        },
        {
          "location": [
            4,
            20,
            4,
            57,
          ],
          "message": ""bg-red-500" uses the raw Tailwind palette. Nearest theme tokens: bg-destructive. Use one of those, or declare --color-<name> in app/globals.css for a new color.",
          "messageId": "paletteClassNear",
          "ruleId": "shadcn-vue/no-raw-colors",
          "suggestions": [
            {
              "message": "Replace with "bg-destructive".",
              "messageId": "useToken",
              "replacement": {
                "range": [
                  125,
                  162,
                ],
                "text": ""bg-destructive rounded-[13px] flex-cols"",
              },
            },
          ],
        },
        {
          "location": [
            4,
            20,
            4,
            57,
          ],
          "message": ""bg-red-500" is not allowed on <Button>: <Button> owns its color. Use a variant: default, outline, secondary, ghost, destructive, link. Add a new variant in components/ui/button/Button.vue only if the design explicitly calls for a treatment none of these provides.",
          "messageId": "appearanceClassWithVariants",
          "ruleId": "shadcn-vue/no-restyle",
          "suggestions": [],
        },
        {
          "location": [
            4,
            20,
            4,
            57,
          ],
          "message": ""bg-red-500" is not allowed on <Button>: <Button> owns its color. Use a variant: default, outline, secondary, ghost, destructive, link. Add a new variant in components/ui/button/Button.vue only if the design explicitly calls for a treatment none of these provides.",
          "messageId": "appearanceClassWithVariants",
          "ruleId": "shadcn-vue/no-restyle",
          "suggestions": [],
        },
        {
          "location": [
            4,
            20,
            4,
            57,
          ],
          "message": ""rounded-[13px]" is not allowed on <Button>: <Button> owns its shape. Use a variant: default, outline, secondary, ghost, destructive, link. Add a new variant in components/ui/button/Button.vue only if the design explicitly calls for a treatment none of these provides.",
          "messageId": "appearanceClassWithVariants",
          "ruleId": "shadcn-vue/no-restyle",
          "suggestions": [],
        },
        {
          "location": [
            4,
            20,
            4,
            57,
          ],
          "message": ""rounded-[13px]" is not allowed on <Button>: <Button> owns its shape. Use a variant: default, outline, secondary, ghost, destructive, link. Add a new variant in components/ui/button/Button.vue only if the design explicitly calls for a treatment none of these provides.",
          "messageId": "appearanceClassWithVariants",
          "ruleId": "shadcn-vue/no-restyle",
          "suggestions": [],
        },
        {
          "location": [
            4,
            20,
            4,
            57,
          ],
          "message": ""flex-cols" is not allowed on <Button>: the grammar does not recognize it. Fix the spelling, or use a class Tailwind generates.",
          "messageId": "unclassifiedClass",
          "ruleId": "shadcn-vue/no-restyle",
          "suggestions": [],
        },
        {
          "location": [
            4,
            20,
            4,
            57,
          ],
          "message": ""flex-cols" is not allowed on <Button>: the grammar does not recognize it. Fix the spelling, or use a class Tailwind generates.",
          "messageId": "unclassifiedClass",
          "ruleId": "shadcn-vue/no-restyle",
          "suggestions": [],
        },
        {
          "location": [
            4,
            20,
            4,
            57,
          ],
          "message": ""flex-cols" is not a class this project's Tailwind knows, so no CSS is generated for it. Did you mean "flex-col"?",
          "messageId": "unknownClassSuggest",
          "ruleId": "shadcn-vue/no-unknown-classes",
          "suggestions": [
            {
              "message": "Replace with "flex-col".",
              "messageId": "useSuggestion",
              "replacement": {
                "range": [
                  125,
                  162,
                ],
                "text": ""bg-red-500 rounded-[13px] flex-col"",
              },
            },
          ],
        },
      ]
    `)
  })

  test("scanAllStrings retains source ownership alongside contextual uses", () => {
    const messages = expectIndependentRules(
      `const unrelated = "bg-red-500 rounded-[13px]"\nconst classes = cn("bg-red-500 rounded-[13px]")`,
      `<Button :class="classes" />`,
      {
        "shadcn-vue/no-arbitrary-values": ["error", { scanAllStrings: true }],
        "shadcn-vue/no-raw-colors": ["error", { scanAllStrings: true }],
        "shadcn-vue/no-restyle": "error",
      }
    )
    for (const rule of ["no-arbitrary-values", "no-raw-colors", "no-restyle"]) {
      expect(
        messages.filter((message) => message.ruleId === `shadcn-vue/${rule}`)
      ).toHaveLength(2)
    }
  })

  test("scanAllStrings reports a bare hoisted literal once", () => {
    const messages = diagnostics(
      `const classes = "p-[13px]"`,
      `<div :class="classes" />`,
      {
        "shadcn-vue/no-arbitrary-values": ["error", { scanAllStrings: true }],
      }
    )
    expect(messages).toHaveLength(1)
    expect(messages[0].message).toContain('"p-[13px]"')
  })

  test("collector options stay isolated between rules", () => {
    const messages = expectIndependentRules(
      `const classes = merge("${CLASSES}")`,
      `<Button :class="classes" />`,
      {
        "shadcn-vue/no-arbitrary-values": [
          "error",
          { mergeFunctions: ["merge"] },
        ],
        "shadcn-vue/no-raw-colors": "error",
        "shadcn-vue/no-unknown-classes": ["error", { mergeFunctions: ["merge"] }],
        "shadcn-vue/no-restyle": [
          "error",
          { mergeFunctions: ["merge"], allow: ["layout"] },
        ],
        "shadcn-vue/require-static-classes": "error",
      }
    )
    // Two appearance findings and the unclassified name.
    expect(messages.map((message) => message.ruleId).sort()).toEqual([
      "shadcn-vue/no-arbitrary-values",
      "shadcn-vue/no-restyle",
      "shadcn-vue/no-restyle",
      "shadcn-vue/no-restyle",
      "shadcn-vue/no-unknown-classes",
      "shadcn-vue/require-static-classes",
    ])
  })

  test("custom variant functions retain their value interpretation", () => {
    const messages = expectIndependentRules(
      `const classes = variants({ base: "${CLASSES}", defaultVariants: { size: "unrelated-value" } })`,
      `<Button :class="classes" />`,
      rulesWith({ variantFunctions: ["variants"] })
    )
    expect(messages.map((message) => message.ruleId).sort()).toEqual([
      "shadcn-vue/no-arbitrary-values",
      "shadcn-vue/no-raw-colors",
      "shadcn-vue/no-restyle",
      "shadcn-vue/no-restyle",
      "shadcn-vue/no-restyle",
      "shadcn-vue/no-unknown-classes",
    ])
  })

  test.each([
    [
      `const { class: className } = defineProps<{ class?: string }>()`,
      `<Button :class="className" />`,
    ],
    [
      `const { class: className = "bg-red-500" } = defineProps<{ class?: string }>()`,
      `<Button :class="className" />`,
    ],
    [
      `const { class: className = build() } = defineProps<{ class?: string }>()`,
      `<Button :class="className" />`,
    ],
    [`const props = build()`, `<Button :class="props.class" />`],
    [
      `let className = "w-full"\nclassName = "bg-red-500"`,
      `<Button :class="className" />`,
    ],
    [
      `const { class: className } = defineProps<{ class?: string }>()`,
      `<Button :class="\`prefix-\${className}\`" />`,
    ],
  ])("forwarded and unresolved values preserve combined output: %s", (script, markup) => {
    expectIndependentRules(script as string, markup as string, rulesWith())
  })
})

describe("a standalone helper call reaches every rule", () => {
  const cases = [
    [
      `import { cva } from "class-variance-authority"\nconst styles = cva("bg-red-500 rounded-[13px]")`,
      `<div :class="styles()" />`,
    ],
    [`${cn}\nconst styles = cn("bg-red-500 rounded-[13px]")`, `<div :class="styles" />`],
  ]
  const orders = [
    { "shadcn-vue/no-raw-colors": "error", "shadcn-vue/no-arbitrary-values": "error" },
    { "shadcn-vue/no-arbitrary-values": "error", "shadcn-vue/no-raw-colors": "error" },
  ]
  test("both rules report in both registration orders", () => {
    for (const [script, markup] of cases) {
      for (const rules of orders) {
        const ids = lint(script, markup, rules)
          .map((m) => m.ruleId)
          .sort()
        expect(ids).toEqual([
          "shadcn-vue/no-arbitrary-values",
          "shadcn-vue/no-raw-colors",
        ])
      }
    }
  })
  test("and through the documented rule set", () => {
    const rules = {
      "shadcn-vue/no-restyle": "error",
      "shadcn-vue/no-raw-colors": "error",
      "shadcn-vue/no-arbitrary-values": "error",
      "shadcn-vue/no-inline-styles": "error",
      "shadcn-vue/require-static-classes": "error",
    }
    for (const [script, markup] of cases) {
      const ids = lint(script, markup, rules)
        .map((m) => m.ruleId)
        .sort()
      expect(ids).toEqual([
        "shadcn-vue/no-arbitrary-values",
        "shadcn-vue/no-raw-colors",
      ])
    }
  })
})
