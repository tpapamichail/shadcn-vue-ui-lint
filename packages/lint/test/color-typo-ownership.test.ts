// Who reports a typo in a class the grammar files under a color: cn's
// text-color and bg-color groups take any value, so text-smal
// classifies as a color although it is a misspelling of text-sm. The
// project's Tailwind knows the nearest real class; when that class is
// not a color, the typo is no-unknown-classes' finding, with the
// spelling, and no-raw-colors stays quiet. A near-miss of a declared
// token (bg-primry) stays with no-raw-colors, as does an undeclared
// token (bg-brand). These need the oracle, so they skip without it.

import tsParser from "@typescript-eslint/parser"
import { Linter } from "eslint"
import { describe, expect, test } from "vitest"
import vueParser from "vue-eslint-parser"

import { plugin } from "../src/index"
import { noRawColors } from "../src/rules/no-raw-colors"
import { noUnknownClasses } from "../src/rules/no-unknown-classes"
import { oracleAvailable, resetOracleMemo } from "../src/tailwind/client"
import { createTester, PAGE, PROJECT, template } from "./helpers"

const oracle = oracleAvailable()

function diagnostics(code: string, rules: Linter.RulesRecord) {
  return new Linter({ cwd: PROJECT })
    .verify(
      code,
      {
        files: ["**/*.vue"],
        languageOptions: {
          parser: vueParser,
          parserOptions: { parser: tsParser, sourceType: "module" },
        },
        plugins: { "shadcn-vue": plugin },
        rules,
      } as any,
      { filename: PAGE }
    )
    .map((m) => ({ ruleId: m.ruleId, messageId: m.messageId }))
}

describe.skipIf(!oracle)("a typo the grammar files under a color", () => {
  const code = template(`<div class="text-smal bg-primry bg-brand" />`)

  test("no-unknown-classes alone reports it with the spelling", () => {
    resetOracleMemo()
    createTester().run("no-unknown-classes", noUnknownClasses as any, {
      valid: [],
      invalid: [
        {
          filename: PAGE,
          code,
          errors: [
            {
              messageId: "unknownClassSuggest",
              data: { className: "text-smal", suggestion: "text-sm" },
              suggestions: [
                {
                  messageId: "useSuggestion",
                  data: { suggestion: "text-sm" },
                  output: code.replace("text-smal", "text-sm"),
                },
              ],
            },
          ],
        },
      ],
    })
  })

  test("no-raw-colors alone leaves it and keeps the token findings", () => {
    createTester().run("no-raw-colors", noRawColors as any, {
      valid: [
        {
          filename: PAGE,
          code: template(`<div class="text-smal" />`),
        },
      ],
      invalid: [
        {
          filename: PAGE,
          code,
          errors: [
            {
              message:
                /"bg-primry" is not a declared theme color\. Did you mean "bg-primary"/,
              suggestions: [
                {
                  messageId: "useToken",
                  data: { replacement: "bg-primary" },
                  output: code.replace("bg-primry", "bg-primary"),
                },
              ],
            },
            {
              message: /"bg-brand" is not a declared theme color\. Use one of/,
            },
          ],
        },
      ],
    })
  })

  test("with both rules on, each class is reported once", () => {
    expect(
      diagnostics(code, {
        "shadcn-vue/no-unknown-classes": "error",
        "shadcn-vue/no-raw-colors": "error",
      })
    ).toEqual([
      {
        ruleId: "shadcn-vue/no-unknown-classes",
        messageId: "unknownClassSuggest",
      },
      { ruleId: "shadcn-vue/no-raw-colors", messageId: "undeclaredTokenTypo" },
      { ruleId: "shadcn-vue/no-raw-colors", messageId: "undeclaredToken" },
    ])
  })
})
