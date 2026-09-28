// `settings["shadcn-vue"].componentPrefix`: what a component
// registration puts in front of every name, as Nuxt's
// `components: [{ path: "~/components/ui", prefix: "Ui" }]` does. A
// project whose components are auto-imported under that prefix writes
// `<UiButton>` and imports nothing, so without the setting the design
// system is invisible to every rule.
//
// The name the project's own ui index owns is what a diagnostic, a
// contract and a variant hint speak of: the prefix belongs to the
// template, not to the component.

import * as fs from "node:fs"
import * as os from "node:os"
import * as path from "node:path"
import tsParser from "@typescript-eslint/parser"
import { Linter } from "eslint"
import { afterEach, beforeEach, describe, expect, test } from "vitest"
import vueParser from "vue-eslint-parser"

import { plugin } from "../src/index"
import { componentsFor } from "../src/project/components"
import { resetWarnings, setWarningSink } from "../src/project/warn"
import { clearWrapperCache } from "../src/project/wrappers"
import { PAGE, PROJECT, sfc, template } from "./helpers"

const BUTTON = path.join(PROJECT, "components/ui/button/Button.vue")
const CARD_TITLE = path.join(PROJECT, "components/ui/card/CardTitle.vue")

const warnings: string[] = []
beforeEach(() => {
  warnings.length = 0
  resetWarnings()
  setWarningSink((message) => warnings.push(message))
  clearWrapperCache()
})
afterEach(() => {
  clearWrapperCache()
  for (const directory of directories)
    fs.rmSync(directory, { recursive: true, force: true })
  directories.clear()
  setWarningSink((message) => console.warn(message))
})

function lint(
  code: string,
  rules: Record<string, unknown> = {
    "shadcn-vue/no-restyle": "error",
  },
  settings?: object,
  project: { cwd: string; page: string } = { cwd: PROJECT, page: PAGE }
) {
  return new Linter({ cwd: project.cwd })
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
      ] as never,
      { filename: project.page }
    )
    .map(({ ruleId, line, message }) => ({ ruleId, line, message }))
}

// A project on disk whose own component forwards the class to an
// auto-imported prefixed tag, so the wrapper's template is read with
// the prefix rather than the linted AST.
const directories = new Set<string>()

function temporaryProject() {
  const root = fs.realpathSync.native(
    fs.mkdtempSync(path.join(os.tmpdir(), "lint-prefix-"))
  )
  directories.add(root)
  const write = (name: string, source: string) => {
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
    `<script setup lang="ts">
import { cva } from "class-variance-authority"

const buttonVariants = cva("inline-flex items-center", {
  variants: {
    size: { default: "h-8 px-2.5", sm: "h-7 px-2" },
  },
  defaultVariants: { size: "default" },
})

const props = defineProps<{ size?: "default" | "sm"; class?: string }>()
</script>

<template>
  <button :class="cn(buttonVariants({ size: props.size }), props.class)" />
</template>
`
  )
  write(
    "components/ui/button/index.ts",
    `export { default as Button } from "./Button.vue"\n`
  )
  // The wrapper's whole template is the auto-imported prefixed tag: the
  // class reaches Button by fallthrough, with no import of its own.
  write(
    "components/SaveButton.vue",
    sfc(`const props = defineProps<{ class?: string }>()`, `<UiButton />`)
  )
  const page = write("app/page.vue", "")
  return { root, button, page }
}

const prefix = { "shadcn-vue": { componentPrefix: "Ui" } }

describe("componentPrefix", () => {
  test("an auto-imported prefixed tag is the project's own component", () => {
    // `<UiButton class="p-4">` imports nothing; the prefix is what makes
    // the tag answer to the ui index.
    const found = lint(
      template(`<UiButton class="p-4">Go</UiButton>`),
      undefined,
      prefix
    )
    expect(found).toHaveLength(1)
    expect(found[0].ruleId).toBe("shadcn-vue/no-restyle")
    // The canonical name, not the prefixed one: a contract written
    // against `Button` has to be the contract that decides.
    expect(found[0].message).toContain('"p-4" is not allowed on <Button>')
  })

  test("a prefixed name the index does not own is not a component", () => {
    expect(
      lint(
        template(`<UiNotAComponent class="p-4">Go</UiNotAComponent>`),
        undefined,
        prefix
      )
    ).toEqual([])
  })

  test("without the setting, a prefixed tag is nobody's component", () => {
    expect(lint(template(`<UiButton class="p-4">Go</UiButton>`))).toEqual([])
  })

  test("unprefixed tags keep resolving, with or without the setting", () => {
    const code = template(`<Button class="p-4">Go</Button>`)
    const without = lint(code)
    expect(without).toHaveLength(1)
    expect(without[0].message).toContain("<Button>")
    expect(lint(code, undefined, prefix)).toEqual(without)
  })

  test("an explicitly imported tag resolves as itself, prefix or no prefix", () => {
    // The import is the resolution; the prefix never renames it.
    const code = sfc(
      `import { Button } from "@/components/ui/button"`,
      `<Button class="p-4">Go</Button>`
    )
    expect(lint(code, undefined, prefix)).toEqual(lint(code))
  })

  test("an ignored import stays ignored under a prefixed name", () => {
    const code = sfc(
      `import { UiButton } from "@/components/ui/button"`,
      `<UiButton class="p-4">Go</UiButton>`
    )
    expect(
      lint(code, undefined, {
        "shadcn-vue": {
          componentPrefix: "Ui",
          ignoreImports: ["^@/components/ui/"],
        },
      })
    ).toEqual([])
  })

  test("variants and the file name come from the canonical component", () => {
    const found = lint(
      template(`<UiButton class="p-4">Go</UiButton>`),
      undefined,
      prefix
    )
    const index = componentsFor(PAGE)
    expect(index.files.get("Button")).toBe(BUTTON)
    // The sizes are read from Button.vue under the name `Button`, not
    // from anything the prefix renamed.
    expect(found[0].message).toContain("Use a size (default, xs, sm, lg")
    expect(found[0].message).toContain("components/ui/button/Button.vue")
  })

  test("a prefixed tag names the same component in any position", () => {
    // CardTitle, not just the top-level Button: the prefix is stripped
    // from the whole name, subcomponents included.
    const found = lint(
      template(`<UiCardTitle class="p-4">Title</UiCardTitle>`),
      undefined,
      prefix
    )
    expect(found).toHaveLength(1)
    expect(found[0].message).toContain("<CardTitle>")
    expect(componentsFor(PAGE).files.get("CardTitle")).toBe(CARD_TITLE)
  })

  test("a prefixed tag inside a project wrapper reaches the ui component", () => {
    // The wrapper lives on disk and its template holds the auto-imported
    // prefixed tag, so the hop across the file boundary is read with the
    // prefix too.
    const { page, root } = temporaryProject()
    const code = sfc(
      `import SaveButton from "@/components/SaveButton.vue"`,
      `<SaveButton class="p-4" />`
    )
    // Without the setting the wrapper's root answers to nothing, so the
    // class stays with a component that is not the design system's.
    expect(lint(code, undefined, undefined, { cwd: root, page })).toEqual([])

    const found = lint(code, undefined, prefix, { cwd: root, page })
    expect(found).toHaveLength(1)
    // The message names the wrapper the class was written on and the
    // canonical component it landed on, with that component's sizes.
    expect(found[0].message).toContain(
      "<SaveButton> passes its class to <Button>, which owns its spacing"
    )
    // The sizes and the file are the ui component's, reached through the
    // prefixed tag.
    expect(found[0].message).toContain("Use a size (default, sm)")
    expect(found[0].message).toContain("components/ui/button/Button.vue")
  })

  test("a kebab-case prefixed tag resolves like its PascalCase form", () => {
    // The template form Nuxt users write: `<ui-card-title>` is the same
    // registered component as `<UiCardTitle>`.
    const found = lint(
      template(`<ui-card-title class="p-4">Title</ui-card-title>`),
      undefined,
      prefix
    )
    expect(found).toHaveLength(1)
    expect(found[0].message).toContain("<CardTitle>")
  })

  test("a rule's own option wins over the setting", () => {
    const code = template(`<UiButton class="p-4">Go</UiButton>`)
    expect(
      lint(
        code,
        { "shadcn-vue/no-restyle": ["error", { componentPrefix: "Xx" }] },
        prefix
      )
    ).toEqual([])
  })

  test("a wrong type warns once and is ignored", () => {
    expect(
      lint(template(`<UiButton class="p-4">Go</UiButton>`), undefined, {
        "shadcn-vue": { componentPrefix: ["Ui"] },
      })
    ).toEqual([])
    expect(warnings).toEqual([
      '[@tpapamichail/shadcn-vue-lint] settings["shadcn-vue"].componentPrefix must be a string; it is ignored.',
    ])
  })

  test("every rule that reads component sites honors it", () => {
    const code = sfc(
      `import { pick } from "./pick"`,
      `<UiButton :class="pick()">Go</UiButton>`
    )
    const rules = { "shadcn-vue/require-static-classes": "error" }
    expect(lint(code, rules, prefix)).toMatchObject([
      { ruleId: "shadcn-vue/require-static-classes" },
    ])
    expect(lint(code, rules)).toEqual([])
  })
})
