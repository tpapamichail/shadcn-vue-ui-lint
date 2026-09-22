// settings["shadcn-vue"]: recognition options written once for every rule,
// and `ui`, an import prefix like components.json's aliases.ui for projects
// without that file. A rule's own option wins over the setting. Plus the
// `allow` validation on the color and value rules: an entry that could
// match nothing is a configuration finding on line 1, not silence.

import * as path from "node:path"
import tsParser from "@typescript-eslint/parser"
import { Linter } from "eslint"
import { afterEach, beforeEach, describe, expect, test } from "vitest"
import vueParser from "vue-eslint-parser"

import { plugin } from "../src/index"
import { resetWarnings, setWarningSink } from "../src/project/warn"
import { PAGE, PROJECT, sfc, template } from "./helpers"

const NO_JSON = path.join(__dirname, "fixtures/no-json")
const NO_JSON_PAGE = path.join(NO_JSON, "src/app/page.vue")

const warnings: string[] = []
beforeEach(() => {
  warnings.length = 0
  resetWarnings()
  setWarningSink((m) => warnings.push(m))
})
afterEach(() => setWarningSink((m) => console.warn(m)))

function lint(
  cwd: string,
  filename: string,
  code: string,
  rules: Record<string, unknown>,
  settings?: object
) {
  return new Linter({ cwd })
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
          rules,
        },
      ] as any,
      { filename }
    )
    .map(({ ruleId, line, message }) => ({ ruleId, line, message }))
}

const restyle = sfc(
  `import { Button } from "@/ds"`,
  `<Button class="bg-highlight">Go</Button>`
)
const rules = {
  "shadcn-vue/no-restyle": "error",
  "shadcn-vue/require-static-classes": "error",
}

describe('settings["shadcn-vue"].ui', () => {
  test("without it, a project with no components.json recognizes nothing", () => {
    expect(lint(NO_JSON, NO_JSON_PAGE, restyle, rules)).toEqual([])
  })

  test("a prefix makes every rule recognize the design system", () => {
    const found = lint(NO_JSON, NO_JSON_PAGE, restyle, rules, {
      "shadcn-vue": { ui: "@/ds" },
    })
    expect(found).toHaveLength(1)
    expect(found[0]).toMatchObject({ ruleId: "shadcn-vue/no-restyle", line: 6 })
    expect(found[0].message).toContain("is not allowed on <Button>")

    const dynamic = sfc(
      `import { Button } from "@/ds/button"\nconst tone = pick()`,
      `<Button :class="tone">Go</Button>`
    )
    expect(
      lint(NO_JSON, NO_JSON_PAGE, dynamic, rules, {
        "shadcn-vue": { ui: ["@/ds"] },
      })
    ).toMatchObject([{ ruleId: "shadcn-vue/require-static-classes", line: 3 }])
  })

  test("the prefix is literal, not a regex, and matches whole segments", () => {
    const other = sfc(
      `import { Button } from "@/dsx"`,
      `<Button class="bg-highlight">Go</Button>`
    )
    expect(
      lint(NO_JSON, NO_JSON_PAGE, other, rules, {
        "shadcn-vue": { ui: "@/ds" },
      })
    ).toEqual([])
  })

  test("adds to a rule's own patterns instead of replacing them", () => {
    const found = lint(
      NO_JSON,
      NO_JSON_PAGE,
      restyle,
      {
        "shadcn-vue/no-restyle": ["error", { componentImports: ["^nothing$"] }],
      },
      { "shadcn-vue": { ui: "@/ds" } }
    )
    expect(found).toHaveLength(1)
  })

  test("a wrong type warns once and is ignored", () => {
    expect(
      lint(NO_JSON, NO_JSON_PAGE, restyle, rules, {
        "shadcn-vue": { ui: 42 },
      })
    ).toEqual([])
    expect(warnings).toEqual([
      '[@tpapamichail/shadcn-vue-lint] settings["shadcn-vue"].ui must be a string or an array of strings; it is ignored.',
    ])
  })
})

describe('settings["shadcn-vue"] as shared defaults', () => {
  test("componentImports applies to every rule", () => {
    const settings = { "shadcn-vue": { componentImports: ["^@/ds(/|$)"] } }
    expect(lint(NO_JSON, NO_JSON_PAGE, restyle, rules, settings)).toMatchObject(
      [{ ruleId: "shadcn-vue/no-restyle" }]
    )
  })

  test("mergeFunctions from settings counts for readability, as the option does", () => {
    // An object handed to an unknown function is dynamic; handed to a
    // named helper it stays readable. The shared setting names helpers
    // the same way the rule's option does.
    const code = sfc(
      `import { Button } from "@/components/ui/button"\nimport { merge } from "./merge"\nconst o = { "bg-red-500": true }`,
      `<Button :class="merge(o)">Go</Button>`
    )
    const restyle = {
      "shadcn-vue/no-restyle": ["error", { allow: ["layout"] }],
    }
    expect(lint(PROJECT, PAGE, code, restyle)).toEqual([])
    const viaOption = lint(PROJECT, PAGE, code, {
      "shadcn-vue/no-restyle": [
        "error",
        { allow: ["layout"], mergeFunctions: ["merge"] },
      ],
    })
    const viaSetting = lint(PROJECT, PAGE, code, restyle, {
      "shadcn-vue": { mergeFunctions: ["merge"] },
    })
    expect(viaOption).toMatchObject([
      { ruleId: "shadcn-vue/no-restyle", line: 4 },
    ])
    expect(viaSetting).toEqual(viaOption)
  })

  test("a rule's own option wins over the setting", () => {
    const settings = { "shadcn-vue": { componentImports: ["^@/ds(/|$)"] } }
    const found = lint(
      NO_JSON,
      NO_JSON_PAGE,
      restyle,
      {
        "shadcn-vue/no-restyle": ["error", { componentImports: ["^nothing$"] }],
      },
      settings
    )
    expect(found).toEqual([])
  })

  test("ignoreImports from settings hides a package", () => {
    const code = sfc(
      `import { Button } from "@/components/ui/button"`,
      `<Button class="bg-red-500">Go</Button>`
    )
    expect(
      lint(PROJECT, PAGE, code, { "shadcn-vue/no-restyle": "error" })
    ).toHaveLength(1)
    expect(
      lint(
        PROJECT,
        PAGE,
        code,
        { "shadcn-vue/no-restyle": "error" },
        {
          "shadcn-vue": { ignoreImports: ["^@/components/ui/"] },
        }
      )
    ).toEqual([])
  })
})

describe("allow validation", () => {
  const red = template(`<div class="bg-blue-500" />`)

  test('"blue-500" names a color, not a class: a line-1 finding with the fix', () => {
    const found = lint(PROJECT, PAGE, red, {
      "shadcn-vue/no-raw-colors": ["error", { allow: ["blue-500"] }],
    })
    expect(found).toHaveLength(1)
    expect(found[0]).toMatchObject({
      ruleId: "shadcn-vue/no-raw-colors",
      line: 1,
    })
    expect(found[0].message).toContain(
      'allow entry "blue-500" names a color, not a class'
    )
    expect(found[0].message).toContain('"*-blue-500"')
  })

  test("a misspelled category is a line-1 finding with a suggestion", () => {
    const found = lint(PROJECT, PAGE, template(`<div class="p-[13px]" />`), {
      "shadcn-vue/no-arbitrary-values": ["error", { allow: ["spacig"] }],
    })
    expect(found).toHaveLength(1)
    expect(found[0]).toMatchObject({
      ruleId: "shadcn-vue/no-arbitrary-values",
      line: 1,
    })
    expect(found[0].message).toContain("spacing")
  })

  test("well-formed entries lint normally", () => {
    for (const allow of [
      ["*-blue-500"],
      ["bg-blue-500"],
      ["color"],
      ["bg-*"],
    ]) {
      expect(
        lint(PROJECT, PAGE, red, {
          "shadcn-vue/no-raw-colors": ["error", { allow }],
        })
      ).toEqual([])
    }
    expect(
      lint(PROJECT, PAGE, template(`<div class="w-[320px] p-[13px]" />`), {
        "shadcn-vue/no-arbitrary-values": ["error", { allow: ["w-[320px]"] }],
      })
    ).toMatchObject([{ line: 2, message: expect.stringContaining("p-[13px]") }])
  })

  test("a real class from the scale is not mistaken for a color", () => {
    const found = lint(PROJECT, PAGE, red, {
      "shadcn-vue/no-raw-colors": ["error", { allow: ["opacity-50", "z-10"] }],
    })
    expect(found).toHaveLength(1)
    expect(found[0].message).not.toContain("allow entry")
  })

  test("no-unknown-classes keeps accepting bare custom names", () => {
    expect(
      lint(PROJECT, PAGE, template(`<div class="toaster" />`), {
        "shadcn-vue/no-unknown-classes": ["error", { allow: ["toaster"] }],
      })
    ).toEqual([])
  })
})
