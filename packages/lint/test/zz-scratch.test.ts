import tsParser from "@typescript-eslint/parser"
import { Linter } from "eslint"
import { test } from "vitest"
import vueParser from "vue-eslint-parser"

import { plugin } from "../src/index"
import { PAGE, PROJECT, sfc } from "./helpers"

const linter = new Linter({ cwd: PROJECT })

function lint(code: string) {
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
          rules: {
            "shadcn-vue/no-restyle": "error",
            "shadcn-vue/require-static-classes": "error",
            "shadcn-vue/no-inline-styles": "error",
            "shadcn-vue/no-raw-colors": "error",
          },
        },
      ] as unknown as Linter.Config[],
      { filename: PAGE }
    )
    .map((m) => `${m.ruleId} ${m.messageId} [${m.line}:${m.column}-${m.endLine}:${m.endColumn}]`)
}

test("probe mixed defaults", () => {
  const cases: [string, string][] = [
    [
      "class default readable, style default unknown",
      sfc(
        `const props = defineProps({ class: { default: "bg-red-500" }, style: { default: build() } })`,
        `<Button :class="props.class" :style="props.style" />`
      ),
    ],
    [
      "class default unknown, style default readable",
      sfc(
        `const props = defineProps({ class: { default: build() }, style: { default: { color: "red" } } })`,
        `<Button :class="props.class" :style="props.style" />`
      ),
    ],
    [
      "both unknown",
      sfc(
        `const props = defineProps({ class: { default: build() }, style: { default: build() } })`,
        `<Button :class="props.class" :style="props.style" />`
      ),
    ],
  ]
  for (const [name, code] of cases) {
    console.log(`--- ${name}`)
    console.log(JSON.stringify(lint(code), null, 1))
  }
})