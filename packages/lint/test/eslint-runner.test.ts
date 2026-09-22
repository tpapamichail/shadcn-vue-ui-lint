// The real ESLint runner over a real flat config — the ESLint analog of
// upstream's test/oxlint.test.ts. RuleTester pins rule behavior in
// isolation; these pin what a project's config gets end to end: a
// per-directory override, contracts and the layout keyword, a contract's
// own words and the settings note, project discovery without
// components.json, and an allow entry that matches nothing as a line-1
// finding instead of a crash.

import * as fs from "node:fs"
import * as os from "node:os"
import * as path from "node:path"
import { fileURLToPath } from "node:url"
import tsParser from "@typescript-eslint/parser"
import { ESLint, Linter } from "eslint"
import { afterEach, describe, expect, test } from "vitest"
import vueParser from "vue-eslint-parser"

import { plugin } from "../src/index"
import { PAGE, PROJECT, sfc } from "./helpers"

const TEST_DIR = path.dirname(fileURLToPath(import.meta.url))
const NO_JSON = path.join(TEST_DIR, "fixtures/no-json")
const NO_JSON_PAGE = path.join(NO_JSON, "src/app/page.vue")

const languageOptions = {
  parser: vueParser,
  parserOptions: {
    parser: tsParser,
    sourceType: "module",
    ecmaFeatures: { jsx: false },
  },
}

// One config object, the real parser chain, code held in memory: the
// project is still discovered upward from the filename.
function verify(
  cwd: string,
  filename: string,
  code: string,
  rules: Record<string, unknown>,
  settings?: object
) {
  return new Linter({ cwd })
    .verify(
      code,
      // Flat config with the plugin object inline; the class's typing
      // predates rules this loosely declared.
      [
        {
          files: ["**/*.vue"],
          languageOptions,
          plugins: { "shadcn-vue": plugin },
          ...(settings ? { settings } : {}),
          rules,
        },
      ] as unknown as Linter.LegacyConfig,
      { filename }
    )
    .map(({ ruleId, line, message }) => ({ ruleId, line, message }))
}

// The runner tests read files and walk the project upward, so unlike
// verify() they need the tree on disk. The config lives outside the
// fixture (overrideConfig), so nothing is written into the tree.
const directories = new Set<string>()

const PAGE_SOURCE = `<script setup lang="ts">
import { Button } from "@/components/ui/button"
</script>

<template>
  <Button class="bg-red-500">Go</Button>
</template>
`

const BUTTON_VARIANTS = `<script setup lang="ts">
import { cva } from "class-variance-authority"

const buttonVariants = cva("inline-flex items-center rounded-md", {
  variants: {
    variant: {
      default: "bg-primary text-primary-foreground",
      outline: "border border-border bg-background",
    },
  },
  defaultVariants: { variant: "default" },
})

const props = defineProps<{
  variant?: "default" | "outline"
  class?: string
}>()
</script>

<template>
  <button
    data-slot="button"
    :class="cn(buttonVariants({ variant: props.variant }), props.class)"
  />
</template>
`

function temporaryProject() {
  const root = fs.realpathSync.native(
    fs.mkdtempSync(path.join(os.tmpdir(), "lint-runner-"))
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
    JSON.stringify({
      tailwind: { css: "app/globals.css" },
      aliases: { ui: "@/components/ui" },
    })
  )
  write(
    "app/globals.css",
    '@import "tailwindcss";\n\n@theme {\n  --color-primary: oklch(0.2 0 0);\n}\n'
  )
  write("components/ui/button/Button.vue", BUTTON_VARIANTS)
  write(
    "components/ui/button/index.ts",
    `export { default as Button } from "./Button.vue"\n`
  )
  const page = write("app/page.vue", PAGE_SOURCE)
  const legacy = write("app/legacy/page.vue", PAGE_SOURCE)
  return { root, write, page, legacy }
}

afterEach(() => {
  for (const directory of directories)
    fs.rmSync(directory, { recursive: true, force: true })
  directories.clear()
})

// The rule ids each file's run produced, sorted: ESLint does not
// guarantee an order between rules on the same line.
function ruleIdsOf(messages: { ruleId: string | null }[]) {
  return messages.map((m) => m.ruleId).sort()
}

describe("eslint runner", () => {
  test(
    "a config object turns a rule off for a directory, as the README's setup does",
    { timeout: 30_000 },
    async () => {
      const { root, page, legacy } = temporaryProject()
      const eslint = new ESLint({
        cwd: root,
        overrideConfigFile: true,
        overrideConfig: [
          {
            files: ["**/*.vue"],
            languageOptions,
            plugins: { "shadcn-vue": plugin },
            rules: {
              "shadcn-vue/no-restyle": "error",
              "shadcn-vue/no-raw-colors": "error",
            },
          },
          {
            files: ["app/legacy/**"],
            rules: { "shadcn-vue/no-restyle": "off" },
          },
        ] as unknown as NonNullable<ESLint.Options["overrideConfig"]>,
      })
      const results = await eslint.lintFiles(["app/**/*.vue"])
      expect(results).toHaveLength(2)
      const pageResult = results.find((r) => r.filePath === page)!
      const legacyResult = results.find((r) => r.filePath === legacy)!

      // The page under the base config keeps both findings, and the
      // styled one names the variants and their file.
      expect(ruleIdsOf(pageResult.messages)).toEqual([
        "shadcn-vue/no-raw-colors",
        "shadcn-vue/no-restyle",
      ])
      const restyle = pageResult.messages.find(
        (m) => m.ruleId === "shadcn-vue/no-restyle"
      )!
      expect(restyle.message).toContain('"bg-red-500" is not allowed on <Button>')
      expect(restyle.message).toContain(
        "Use a variant: default, outline. Add a new variant in components/ui/button/Button.vue"
      )
      expect(
        pageResult.messages.some((m) =>
          m.message.includes("uses the raw Tailwind palette")
        )
      ).toBe(true)

      // The override silences no-restyle under app/legacy, and nothing else.
      expect(ruleIdsOf(legacyResult.messages)).toEqual([
        "shadcn-vue/no-raw-colors",
      ])
      expect(
        legacyResult.messages.some((m) =>
          m.message.includes("is not allowed on <Button>")
        )
      ).toBe(false)
    }
  )

  test("contracts and the layout keyword apply under a real config on a .vue file", () => {
    const button = `import { Button } from "@/components/ui/button"`
    const card = `import { Card } from "@/components/ui/card"`
    // A contract replaces the top-level list: layout opened for Button is
    // still closed on Card, and a layout class there names what the
    // contract allows instead.
    const closed = {
      "shadcn-vue/no-restyle": [
        "error",
        {
          allow: ["layout"],
          contracts: [{ pattern: "^Card$", allow: ["spacing"] }],
        },
      ],
    }
    expect(
      verify(PROJECT, PAGE, sfc(button, `<Button class="mt-4">Go</Button>`), closed)
    ).toEqual([])
    const shut = verify(
      PROJECT,
      PAGE,
      sfc(card, `<Card class="mt-4 bg-highlight">Hi</Card>`),
      closed
    )
    expect(shut.map(({ message }) => message)).toEqual([
      '"mt-4" is not allowed on <Card>: its contract allows spacing. Use one of those, or put layout classes on a parent element.',
      expect.stringContaining(
        '"bg-highlight" is not allowed on <Card>: <Card> owns its color.'
      ),
    ])
    // The keyword inside a contract opens placement, not an unclassified
    // name, and color stays owned.
    const open = {
      "shadcn-vue/no-restyle": [
        "error",
        { contracts: [{ pattern: "^Card$", allow: ["layout"] }] },
      ],
    }
    const opened = verify(
      PROJECT,
      PAGE,
      sfc(card, `<Card class="mt-4 bg-red-500">Hi</Card>`),
      open
    )
    expect(opened).toHaveLength(1)
    expect(opened[0].message).toContain(
      '"bg-red-500" is not allowed on <Card>: <Card> owns its color.'
    )
  })

  test("a contract's message and the settings note reach the reported message", () => {
    const found = verify(
      PROJECT,
      PAGE,
      sfc(
        `import { Button } from "@/components/ui/button"`,
        `<Button class="bg-primary">Go</Button>`
      ),
      {
        "shadcn-vue/no-restyle": [
          "error",
          {
            contracts: [
              { pattern: "^Button$", message: "Buttons are variants only." },
            ],
          },
        ],
      },
      { "shadcn-vue": { note: "See DESIGN.md." } }
    )
    // The contract's words replace the rule's text; the note trails.
    expect(found).toEqual([
      {
        ruleId: "shadcn-vue/no-restyle",
        line: 6,
        message: "Buttons are variants only. See DESIGN.md.",
      },
    ])
    expect(found[0].message).not.toContain("owns its color")
  })

  test("no components.json: settings ui, discovered theme, barrel variants", () => {
    const found = verify(
      NO_JSON,
      NO_JSON_PAGE,
      sfc(
        `import { Button } from "@/ds"`,
        `<Button class="bg-highlight">Go</Button>`
      ),
      { "shadcn-vue/no-restyle": "error", "shadcn-vue/no-raw-colors": "error" },
      { "shadcn-vue": { ui: "@/ds" } }
    )
    // The barrel's Button is recognized without components.json, its
    // variants read from src/ds/button/Button.vue.
    expect(found.find((f) => f.ruleId === "shadcn-vue/no-restyle")).toEqual({
      ruleId: "shadcn-vue/no-restyle",
      line: 6,
      message:
        '"bg-highlight" is not allowed on <Button>: <Button> owns its color. Use a variant: primary, secondary. Add a new variant in src/ds/button/Button.vue only if the design explicitly calls for a treatment none of these provides.',
    })
    // The theme is discovered from the stylesheets, the biggest one named.
    expect(found.find((f) => f.ruleId === "shadcn-vue/no-raw-colors")).toEqual({
      ruleId: "shadcn-vue/no-raw-colors",
      line: 6,
      message:
        '"bg-highlight" is not a declared theme color. Use one of: accent, accent-ink, ink, ink-muted, line, paper. To add a color, declare --color-<name> in src/styles.css first.',
    })
  })

  test(
    "an allow entry that matches nothing is a line-1 finding, not a crash",
    { timeout: 30_000 },
    async () => {
      const { root, page } = temporaryProject()
      const eslint = new ESLint({
        cwd: root,
        overrideConfigFile: true,
        overrideConfig: [
          {
            files: ["**/*.vue"],
            languageOptions,
            plugins: { "shadcn-vue": plugin },
            rules: {
              "shadcn-vue/no-raw-colors": ["error", { allow: ["blue-500"] }],
            },
          },
        ] as unknown as NonNullable<ESLint.Options["overrideConfig"]>,
      })
      // The run completes: a broken policy comes out as a finding, not a
      // thrown error the runner would die on.
      const results = await eslint.lintFiles(["app/page.vue"])
      expect(results).toHaveLength(1)
      expect(results[0].filePath).toBe(page)
      expect(results[0].errorCount).toBe(1)
      const [message] = results[0].messages
      expect(message).toMatchObject({
        ruleId: "shadcn-vue/no-raw-colors",
        severity: 2,
        line: 1,
        column: 1,
      })
      // A parse failure would carry fatal: true; this is a rule finding.
      expect(message.fatal).toBeUndefined()
      expect(message.message).toContain(
        'allow entry "blue-500" names a color, not a class, so it would match nothing. Did you mean "*-blue-500"'
      )
    }
  )
})
