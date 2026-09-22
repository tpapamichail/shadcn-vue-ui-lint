import * as fs from "node:fs"
import * as os from "node:os"
import * as path from "node:path"
import tsParser from "@typescript-eslint/parser"
import { Linter } from "eslint"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import vueParser from "vue-eslint-parser"

import { plugin } from "../src/index"
import { list } from "../src/project/ast"
import { resetFsMemo } from "../src/project/fs"
import { parseSfc } from "../src/project/sfc"
import { clearWrapperCache, wrapperTargetOf } from "../src/project/wrappers"
import { createComponentTracker } from "../src/sites/collect"
import { PAGE, PROJECT, sfc, template } from "./helpers"

// The file under test. Its wrapper comes from the SFC supplied to the
// analysis, so what the file holds does not matter: it is where the
// imports resolve from.
const FILE = path.join(PROJECT, "components/Section.vue")
const BUTTON = path.join(PROJECT, "components/ui/button/Button.vue")
const PACKAGE = path.join(PROJECT, "node_modules/other-kit/index.js")
const directories = new Set<string>()

beforeEach(clearWrapperCache)
afterEach(() => {
  vi.useRealTimers()
  clearWrapperCache()
  resetFsMemo()
  for (const directory of directories)
    fs.rmSync(directory, { recursive: true, force: true })
  directories.clear()
})

function sourceFor(imports: string, tag: string) {
  return sfc(imports, `<${tag} v-bind="$attrs" />`)
}

function parsedOf(source: string, file: string) {
  const parsed = parseSfc(source, file)
  if (!parsed?.program) throw new Error(`could not parse ${file}`)
  return { program: parsed.program, template: parsed.template }
}

function identities(
  imports: string,
  tag: string,
  patterns: string[] = [],
  ignored: string[] = []
) {
  const parsed = parsedOf(sourceFor(imports, tag), FILE)
  const tracker = createComponentTracker(
    { physicalFilename: FILE, sourceCode: { ast: parsed.program } },
    { componentImports: patterns, ignoreImports: ignored }
  )
  for (const statement of list(parsed.program, "body")) {
    if (statement.type === "ImportDeclaration") tracker.collectImport(statement)
  }
  return {
    tracked: tracker.resolve(tag),
    wrapped: wrapperTargetOf(
      FILE,
      "default",
      patterns.map((pattern) => new RegExp(pattern)),
      parsed
    ),
  }
}

function temporaryProject() {
  const root = fs.realpathSync.native(
    fs.mkdtempSync(path.join(os.tmpdir(), "lint-import-identity-"))
  )
  directories.add(root)
  function write(name: string, source: string) {
    const file = path.join(root, name)
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file, source)
    return file
  }
  write("package.json", JSON.stringify({ private: true }))
  write(
    "components.json",
    JSON.stringify({ aliases: { ui: "@/components/ui" } })
  )
  const button = write(
    "components/ui/button/Button.vue",
    template(`<button data-slot="button" />`)
  )
  write(
    "components/ui/button/index.ts",
    `export { default as Button } from "./Button.vue"\n`
  )
  const card = write(
    "components/ui/card/Card.vue",
    template(`<div data-slot="card" />`)
  )
  write(
    "components/ui/card/index.ts",
    `export { default as Card } from "./Card.vue"\n`
  )
  return { write, button, card }
}

describe("imported component identity", () => {
  // Namespace and member tags (<UI.Button>, <B.Icon>) have no Vue
  // counterpart: a template resolves plain tag names only.
  test.each([
    {
      name: "named",
      imports: 'import { Button } from "@/components/ui/button"',
      tag: "Button",
      component: "Button",
    },
    {
      name: "renamed barrel",
      imports: 'import { Action } from "@/components/barrel"',
      tag: "Action",
      component: "Button",
    },
  ])(
    "$name agrees between the collector and wrapper analysis",
    ({ imports, tag, component }) => {
      expect(identities(imports, tag)).toEqual({
        tracked: { component, file: BUTTON, wrapper: null },
        wrapped: { component, file: BUTTON },
      })
    }
  )

  test("retains the wrapper label for a default-imported wrapper", () => {
    expect(
      identities(
        'import Save from "@/components/DefaultSaveButton.vue"',
        "Save"
      )
    ).toEqual({
      tracked: { component: "Button", file: BUTTON, wrapper: "Save" },
      wrapped: { component: "Button", file: BUTTON },
    })
  })

  test("owned bindings take priority over import patterns", () => {
    expect(
      identities('import { Action } from "@/components/barrel"', "Action", [
        "^@/",
      ])
    ).toEqual({
      tracked: { component: "Button", file: BUTTON, wrapper: null },
      wrapped: { component: "Button", file: BUTTON },
    })
  })

  test("patterns recognize packages before package exclusion", () => {
    const imports = 'import { Button } from "other-kit"'
    expect(identities(imports, "Button")).toEqual({
      tracked: null,
      wrapped: null,
    })
    clearWrapperCache()
    expect(identities(imports, "Button", ["^other-kit$"])).toEqual({
      tracked: { component: "Button", file: PACKAGE, wrapper: null },
      wrapped: { component: "Button", file: PACKAGE },
    })
  })

  test("collector ignore patterns precede owned and pattern recognition", () => {
    expect(
      identities(
        'import { Button } from "@/components/ui/button"',
        "Button",
        ["^@/"],
        ["ui/button"]
      )
    ).toEqual({
      tracked: null,
      wrapped: { component: "Button", file: BUTTON },
    })
  })

  test("owned imports do not advance a wrapper's stateful pattern", () => {
    const pattern = /ui/g
    const parsed = parsedOf(
      sourceFor('import { Button } from "@/components/ui/button"', "Button"),
      FILE
    )
    expect(wrapperTargetOf(FILE, "default", [pattern], parsed)).toEqual({
      component: "Button",
      file: BUTTON,
    })
    expect(pattern.lastIndex).toBe(0)
  })

  test("pattern-recognized missing imports still produce a complete cached result", () => {
    const pattern = /missing-kit/g
    const parsed = parsedOf(
      sourceFor('import { Action } from "missing-kit"', "Action"),
      FILE
    )
    const target = { component: "Action", file: null }
    expect(wrapperTargetOf(FILE, "default", [pattern], parsed)).toEqual(target)
    expect(pattern.lastIndex).toBe("missing-kit".length)
    expect(wrapperTargetOf(FILE, "default", [pattern], parsed)).toEqual(target)
    expect(pattern.lastIndex).toBe("missing-kit".length)
  })

  test("renamed component diagnostics retain identity, text and location", () => {
    const code = sfc(
      `import { Action } from "@/components/barrel"`,
      `<Action class="rounded-full" />`
    )
    const messages = new Linter({ cwd: PROJECT }).verify(
      code,
      {
        files: ["**/*.vue"],
        languageOptions: {
          parser: vueParser,
          parserOptions: { parser: tsParser, sourceType: "module" },
        },
        plugins: { "shadcn-vue": plugin },
        rules: {
          "shadcn-vue/no-restyle": ["error", { componentImports: ["^@/"] }],
        },
      } as any,
      { filename: PAGE }
    )
    expect(
      messages.map(
        ({ ruleId, messageId, message, line, column, endLine, endColumn }) => ({
          ruleId,
          messageId,
          message,
          line,
          column,
          endLine,
          endColumn,
        })
      )
    ).toEqual([
      {
        ruleId: "shadcn-vue/no-restyle",
        messageId: "appearanceClassWithVariants",
        message:
          '"rounded-full" is not allowed on <Button>: <Button> owns its shape. Use a variant: default, outline, secondary, ghost, destructive, link. Add a new variant in components/ui/button/Button.vue only if the design explicitly calls for a treatment none of these provides.',
        line: 6,
        column: 15,
        endLine: 6,
        endColumn: 29,
      },
    ])
  })

  test("unresolved name fallback is retried when its import appears", () => {
    vi.useFakeTimers({ toFake: ["Date"] })
    const { write, button, card } = temporaryProject()
    const outer = write(
      "components/Outer.vue",
      sfc(`import { Button } from "./inner"`, `<Button v-bind="$attrs" />`)
    )
    expect(wrapperTargetOf(outer, "Outer")).toEqual({
      component: "Button",
      file: button,
    })
    write("components/inner.ts", 'export { Card as Button } from "./ui/card"')
    vi.setSystemTime(Date.now() + 1500)
    expect(wrapperTargetOf(outer, "Outer")).toEqual({
      component: "Card",
      file: card,
    })
  })

  test("cross-file cycles keep incomplete results out of the cache", () => {
    const { write, button, card } = temporaryProject()
    const alpha = write(
      "components/alpha.vue",
      sfc(
        `import { Beta } from "./beta"\nimport { Button } from "./ui/button"`,
        `<Beta v-bind="$attrs" />\n  <Button v-bind="$attrs" />`
      )
    )
    const beta = write(
      "components/beta.vue",
      sfc(
        `import { Alpha } from "./alpha"\nimport { Card } from "./ui/card"`,
        `<Alpha v-bind="$attrs" />\n  <Card v-bind="$attrs" />`
      )
    )
    expect(wrapperTargetOf(alpha, "Alpha")).toEqual({
      component: "Card",
      file: card,
    })
    expect(wrapperTargetOf(beta, "Beta")).toEqual({
      component: "Button",
      file: button,
    })
  })
})
