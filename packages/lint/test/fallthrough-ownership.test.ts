// Which component owns a class passed to a wrapper that never declares
// the class attr. Vue's attribute fallthrough puts received attrs on the
// template's single root, so a wrapper with nothing but <Button /> in its
// template still hands the class to Button — and classes passed to it are
// judged against the ui target's variants and contracts, exactly as for
// an explicit `:class="props.class"` forward (wrappers.test.ts). When the
// wrapper turns fallthrough off with defineOptions({ inheritAttrs: false
// }), nothing lands on the root: the class stays with the wrapper, which
// is not a design-system component, and the rule stays silent.
//
// The wrapper files live on disk: the page under lint imports them, and
// the wrapper's template is read from its file, not from the linted SFC.

import * as fs from "node:fs"
import * as os from "node:os"
import * as path from "node:path"
import type { RuleDefinition } from "@eslint/core"
import { afterEach, beforeEach, describe, expect, test } from "vitest"

import { clearWrapperCache } from "../src/project/wrappers"
import { noRestyle } from "../src/rules/no-restyle"
import { createTester, sfc, template } from "./helpers"

const tester = createTester()
// The rule declares its context loosely; the runner takes it as written.
const rule = noRestyle as never as RuleDefinition

const directories = new Set<string>()

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

// The fallthrough wrapper's whole template is the ui component; there is
// no forwarding line and no class prop.
const FALLTHROUGH = sfc(
  `import { Button } from "@/components/ui/button"`,
  `<Button />`
)

// Fallthrough off: the received attrs stop at the wrapper.
const DISABLED = sfc(
  `import { Button } from "@/components/ui/button"\ndefineOptions({ inheritAttrs: false })`,
  `<Button />`
)

function temporaryProject() {
  const root = fs.realpathSync.native(
    fs.mkdtempSync(path.join(os.tmpdir(), "lint-fallthrough-"))
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
  const button = write("components/ui/button/Button.vue", BUTTON_VARIANTS)
  write(
    "components/ui/button/index.ts",
    `export { default as Button } from "./Button.vue"\n`
  )
  write("components/FallthroughButton.vue", FALLTHROUGH)
  write("components/DisabledFallthrough.vue", DISABLED)
  // The page under lint: its path decides which project resolves.
  const page = write("app/page.vue", "")
  return { root, button, page }
}

beforeEach(clearWrapperCache)
afterEach(() => {
  clearWrapperCache()
  for (const directory of directories)
    fs.rmSync(directory, { recursive: true, force: true })
  directories.clear()
})

// The path a finding names: relative to the linter's cwd when the file
// is under it, absolute otherwise (src/rules/messages.ts).
function displayPathOf(file: string) {
  const relative = path.relative(process.cwd(), file)
  return (relative.startsWith("..") ? file : relative).replace(/\\/g, "/")
}

describe("fallthrough ownership", () => {
  test("a fallthrough wrapper is judged against the root ui component", () => {
    const { button, page } = temporaryProject()
    const importLine = `import FallthroughButton from "@/components/FallthroughButton.vue"`
    const where = displayPathOf(button)
    tester.run("no-restyle", rule, {
      valid: [
        // Layout crosses the fallthrough to Button, so the layout allow
        // opens placement here the way it does on Button itself.
        {
          filename: page,
          options: [{ allow: ["layout"] }],
          code: sfc(
            importLine,
            `<FallthroughButton class="mt-4 w-full">Go</FallthroughButton>`
          ),
        },
      ],
      invalid: [
        // The variants come from Button, which is what gets the class.
        {
          filename: page,
          code: sfc(importLine, `<FallthroughButton class="bg-red-500" />`),
          errors: [
            {
              messageId: "appearanceClassViaWrapper",
              data: {
                className: "bg-red-500",
                component: "Button",
                category: "color",
                wrapper: "FallthroughButton",
                variants: "default, outline",
                variantsSuffix: ": default, outline",
                file: where,
                where: `in ${where}`,
              },
            },
          ],
        },
      ],
    })
  })

  test("a contract for the target governs what a fallthrough wrapper passes", () => {
    const { page } = temporaryProject()
    const importLine = `import FallthroughButton from "@/components/FallthroughButton.vue"`
    // The contract matches the component the class lands on, not the
    // wrapper it was written on: layout opens, color stays owned.
    tester.run("no-restyle", rule, {
      valid: [
        {
          filename: page,
          options: [
            { contracts: [{ pattern: "^Button$", allow: ["layout"] }] },
          ],
          code: sfc(importLine, `<FallthroughButton class="mt-4" />`),
        },
      ],
      invalid: [
        {
          filename: page,
          options: [
            { contracts: [{ pattern: "^Button$", allow: ["layout"] }] },
          ],
          code: sfc(importLine, `<FallthroughButton class="bg-red-500" />`),
          errors: [
            {
              message:
                /^"bg-red-500" is not allowed on <FallthroughButton>: <FallthroughButton> passes its class to <Button>, which owns its color\./,
            },
          ],
        },
      ],
    })
  })

  test("with fallthrough disabled the class stays with the wrapper", () => {
    const { page } = temporaryProject()
    const importLine = `import DisabledFallthrough from "@/components/DisabledFallthrough.vue"`
    // The received attrs stop at the wrapper, which is not a
    // design-system component, so a class on it is nobody's contract.
    tester.run("no-restyle", rule, {
      valid: [
        {
          filename: page,
          code: sfc(
            importLine,
            `<DisabledFallthrough class="bg-red-500 rounded-full">Go</DisabledFallthrough>`
          ),
        },
        // Still silent with a layout option: nothing is forwarded at all.
        {
          filename: page,
          options: [{ allow: ["layout"] }],
          code: sfc(importLine, `<DisabledFallthrough class="mt-4" />`),
        },
      ],
      invalid: [],
    })
  })

  test("the wrapper file is read from disk, not guessed from the tag", () => {
    // A project-local component whose file says one thing and whose name
    // another: the same tag with the file deleted is not a wrapper, so
    // ownership really comes from the template on disk.
    const { root, page } = temporaryProject()
    const importLine = `import FallthroughButton from "@/components/FallthroughButton.vue"`
    fs.rmSync(path.join(root, "components/FallthroughButton.vue"))
    clearWrapperCache()
    tester.run("no-restyle", rule, {
      valid: [
        {
          filename: page,
          code: sfc(importLine, `<FallthroughButton class="bg-red-500" />`),
        },
      ],
      invalid: [],
    })
  })

  test("a script-less SFC falls through the same way", () => {
    // A script-less SFC is still a wrapper: the bare template's single
    // root receives the class.
    const { root, button, page } = temporaryProject()
    const importLine = `import FallthroughButton from "@/components/FallthroughButton.vue"`
    fs.writeFileSync(
      path.join(root, "components/FallthroughButton.vue"),
      template(`<Button />`)
    )
    clearWrapperCache()
    const where = displayPathOf(button)
    tester.run("no-restyle", rule, {
      valid: [],
      invalid: [
        {
          filename: page,
          code: sfc(importLine, `<FallthroughButton class="bg-red-500" />`),
          errors: [
            {
              messageId: "appearanceClassViaWrapper",
              data: {
                className: "bg-red-500",
                component: "Button",
                category: "color",
                wrapper: "FallthroughButton",
                variants: "default, outline",
                variantsSuffix: ": default, outline",
                file: where,
                where: `in ${where}`,
              },
            },
          ],
        },
      ],
    })
  })
})
