import * as fs from "node:fs"
import * as path from "node:path"
import tsParser from "@typescript-eslint/parser"
import { Linter } from "eslint"
import { describe, expect, test } from "vitest"
import vueParser from "vue-eslint-parser"

import { plugin } from "../src/index"
import { noRestyle } from "../src/rules/no-restyle"
import { createTester, PAGE, PROJECT, sfc } from "./helpers"

const tester = createTester()

const boundary = noRestyle as any

const appearance = () => ({ messageId: "appearanceClassWithVariants" })

const lint = (code: string, rules: Record<string, unknown>) =>
  new Linter({ cwd: PROJECT }).verify(
    code,
    [
      {
        files: ["**/*.vue"],
        languageOptions: {
          parser: vueParser,
          parserOptions: { parser: tsParser, sourceType: "module" },
        },
        plugins: { "shadcn-vue": plugin },
        rules,
      },
    ] as any,
    { filename: PAGE }
  )

describe("component identity follows the import", () => {
  test("renamed re-exports, default wrappers and untyped sources", () => {
    tester.run("no-restyle", boundary, {
      valid: [
        // A package's Button of the same name is not ours once the
        // import resolves into node_modules.
        {
          filename: PAGE,
          code: sfc(
            `import { Button } from "other-kit"`,
            `<Button class="bg-red-500" />`
          ),
        },
      ],
      invalid: [
        {
          filename: PAGE,
          code: sfc(
            `import { Action } from "@/components/barrel"`,
            `<Action class="bg-red-500">Go</Action>`
          ),
          errors: [appearance()],
        },
        {
          filename: PAGE,
          code: sfc(
            `import { Save } from "@/components/barrel"`,
            `<Save class="bg-red-500">Go</Save>`
          ),
          errors: [{ messageId: "appearanceClassViaWrapper" }],
        },
        // The memo-wrapper and namespace-wrapper cases are gone:
        // React.memo and namespace member tags have no Vue counterpart,
        // because a component is its file and <W.SaveButton> is not a
        // template tag.
        {
          filename: PAGE,
          code: sfc(
            `import Save from "@/components/DefaultSaveButton.vue"`,
            `<Save class="bg-red-500">Go</Save>`
          ),
          errors: [{ messageId: "appearanceClassViaWrapper" }],
        },
        {
          filename: PAGE,
          code: sfc(
            `import { LegacyChip } from "@/components/ui/legacy-chip"`,
            `<LegacyChip class="bg-red-500" />`
          ),
          errors: [{ messageId: "appearanceClassNoVariants" }],
        },
      ],
    })
  })
})

describe("identity through barrels and path casing", () => {
  const caseInsensitive = fs.existsSync(
    path.join(PROJECT, "COMPONENTS/UI/BUTTON/BUTTON.VUE")
  )
  test("import-then-export barrels keep the component", () => {
    tester.run("no-restyle", noRestyle as any, {
      valid: [],
      invalid: [
        {
          filename: PAGE,
          code: sfc(
            `import { Action } from "@/components/rebound-barrel"`,
            `<Action class="bg-red-500">Go</Action>`
          ),
          errors: [{ messageId: "appearanceClassWithVariants" }],
        },
        {
          filename: PAGE,
          code: sfc(
            `import { Save2 } from "@/components/rebound-barrel"`,
            `<Save2 class="bg-red-500">Go</Save2>`
          ),
          errors: [{ messageId: "appearanceClassViaWrapper" }],
        },
      ],
    })
  })
  test.skipIf(!caseInsensitive)(
    "a differently cased import path is the same file",
    () => {
      const messages = lint(
        sfc(
          `import { Button } from "@/COMPONENTS/UI/BUTTON"`,
          `<Button class="bg-red-500">Go</Button>`
        ),
        { "shadcn-vue/no-restyle": "error" }
      )
      expect(messages.map((m) => m.ruleId)).toEqual(["shadcn-vue/no-restyle"])
    }
  )
})

describe("default wrapper names", () => {
  test("a default-imported wrapper is named by its local name", () => {
    const [message] = lint(
      sfc(
        `import Save from "@/components/DefaultSaveButton.vue"`,
        `<Save class="bg-red-500">Go</Save>`
      ),
      { "shadcn-vue/no-restyle": "error" }
    )
    expect(message.message).toContain("<Save> passes its class to <Button>")
  })
})
