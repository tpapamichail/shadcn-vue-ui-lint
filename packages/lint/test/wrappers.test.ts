import * as fs from "node:fs"
import * as os from "node:os"
import * as path from "node:path"
import { afterEach, beforeEach, describe, expect, test } from "vitest"

import { parseSfc } from "../src/project/sfc"
import { clearWrapperCache, wrapperTargetOf } from "../src/project/wrappers"
import { noRestyle } from "../src/rules/no-restyle"
import { createTester, PAGE, sfc, template } from "./helpers"

// The React-only wrapper forms are gone, because a Vue component is one
// file: React.memo and forwardRef, same-file local wrappers with their
// alias chains and cycles, and namespace member tags (<W.SaveButton>).

const PROJECT = path.join(__dirname, "fixtures/project")
const SAVE_BUTTON = path.join(PROJECT, "components/SaveButton.vue")
const CANCEL_BUTTON = path.join(PROJECT, "components/CancelButton.vue")
const PRIMARY_ACTION = path.join(PROJECT, "components/PrimaryAction.vue")
const PANEL = path.join(PROJECT, "components/Panel.vue")
const SECTION = path.join(PROJECT, "components/Section.vue")
const FIXED_BUTTON = path.join(PROJECT, "components/FixedButton.vue")
const BUTTON = path.join(PROJECT, "components/ui/button/Button.vue")
const CARD_CONTENT = path.join(PROJECT, "components/ui/card/CardContent.vue")

const tester = createTester()
const rule = noRestyle as any

const buttonImport = `import { Button } from "@/components/ui/button"`
const cardImport = `import { Card } from "@/components/ui/card"`
const saveButton = `import SaveButton from "@/components/SaveButton.vue"`
const section = `import Section from "@/components/Section.vue"`
const cancelButton = `import CancelButton from "@/components/CancelButton.vue"`
const primaryAction = `import PrimaryAction from "@/components/PrimaryAction.vue"`

// The binding forms write their own component files: the wrapper is the
// file that owns the template, so each form needs one on disk.
const directories = new Set<string>()

function temporaryProject() {
  const root = fs.realpathSync.native(
    fs.mkdtempSync(path.join(os.tmpdir(), "lint-wrappers-"))
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
  write("components/ui/card/Card.vue", template(`<div data-slot="card" />`))
  write(
    "components/ui/card/index.ts",
    `export { default as Card } from "./Card.vue"\n`
  )
  return { write, button }
}

// The supplied SFC stands in for the file the linter already parsed, the
// way it hands its own AST to the analysis.
function parsedOf(source: string, file: string) {
  const parsed = parseSfc(source, file)
  if (!parsed?.program) throw new Error(`could not parse ${file}`)
  return { program: parsed.program, template: parsed.template }
}

beforeEach(clearWrapperCache)
afterEach(() => {
  clearWrapperCache()
  for (const directory of directories)
    fs.rmSync(directory, { recursive: true, force: true })
  directories.clear()
})

describe("wrapperTargetOf", () => {
  test("finds the forwarded design-system component", () => {
    expect(wrapperTargetOf(SAVE_BUTTON, "SaveButton")).toEqual({
      component: "Button",
      file: BUTTON,
    })
    // A .vue file's default export goes by the file's own name too.
    expect(wrapperTargetOf(SAVE_BUTTON, "default")).toEqual({
      component: "Button",
      file: BUTTON,
    })
    expect(wrapperTargetOf(CANCEL_BUTTON, "CancelButton")).toEqual({
      component: "Button",
      file: BUTTON,
    })
    expect(wrapperTargetOf(PRIMARY_ACTION, "PrimaryAction")).toEqual({
      component: "Button",
      file: BUTTON,
    })
    expect(wrapperTargetOf(PANEL, "Panel")).toEqual({
      component: "CardContent",
      file: CARD_CONTENT,
    })
  })

  test("a plain element is not a wrapper", () => {
    expect(wrapperTargetOf(SECTION, "Section")).toBeNull()
    expect(wrapperTargetOf(FIXED_BUTTON, "FixedButton")).toBeNull()
    expect(wrapperTargetOf(SAVE_BUTTON, "Missing")).toBeNull()
  })
})

describe("wrapper binding forms", () => {
  test.each([
    [
      "a class prop on the root",
      sfc(
        `${buttonImport}\nconst props = defineProps<{ class?: string }>()`,
        `<Button :class="props.class" />`
      ),
    ],
    [
      "the attrs object spread on the root",
      sfc(buttonImport, `<Button v-bind="$attrs" />`),
    ],
    [
      "a destructured class prop",
      sfc(
        `${buttonImport}\nconst { class: className } = defineProps<{ class?: string }>()`,
        `<Button :class="className" />`
      ),
    ],
    [
      "useAttrs spread on the root",
      sfc(
        `${buttonImport}\nconst attrs = useAttrs()`,
        `<Button v-bind="attrs" />`
      ),
    ],
    ["a root with no script at all", template(`<Button />`)],
    [
      "explicit forwarding beside inheritAttrs: false",
      sfc(
        `${buttonImport}\ndefineOptions({ inheritAttrs: false })\nconst props = defineProps<{ class?: string }>()`,
        `<Button :class="props.class" />`
      ),
    ],
    [
      "a forwarding element after a plain root",
      sfc(
        `${buttonImport}\nconst props = defineProps<{ class?: string }>()`,
        `<div :class="props.class" />\n  <Button :class="props.class" />`
      ),
    ],
    [
      "a non-root element of a fragment",
      sfc(buttonImport, `<div />\n  <Button v-bind="$attrs" />`),
    ],
  ])("forwards the class: %s", (_name, source) => {
    const { write, button } = temporaryProject()
    const file = write("components/Wrapper.vue", source)
    expect(wrapperTargetOf(file, "default")).toEqual({
      component: "Button",
      file: button,
    })
  })

  test.each([
    [
      "a plain root",
      sfc(
        `const props = defineProps<{ class?: string }>()`,
        `<section :class="props.class" />`
      ),
    ],
    [
      "inheritAttrs: false with no forwarding line",
      sfc(
        `${buttonImport}\ndefineOptions({ inheritAttrs: false })\ndefineProps<{ class?: string }>()`,
        `<Button class="w-full" />`
      ),
    ],
    [
      "inheritAttrs: false in an options object",
      `<script lang="ts">\n${buttonImport}\nexport default { inheritAttrs: false }\n</script>\n\n${template(`<Button />`)}`,
    ],
    ["a slot root", sfc(buttonImport, `<slot />`)],
    ["plain roots only", sfc("", `<div />\n  <section />`)],
    [
      "a fragment root, which Vue falls nothing through to",
      sfc(`${buttonImport}\n${cardImport}`, `<Button />\n  <Card />`),
    ],
    [
      "a v-if chain whose branches disagree",
      sfc(
        `${buttonImport}\n${cardImport}\nconst on = true`,
        `<Button v-if="on" />\n  <Card v-else />`
      ),
    ],
  ])("is not a wrapper: %s", (_name, source) => {
    const { write } = temporaryProject()
    const file = write("components/Wrapper.vue", source)
    expect(wrapperTargetOf(file, "default")).toBeNull()
  })

  test.each([
    ["script setup", sfc(buttonImport, `<Button v-bind="$attrs" />`)],
    ["no script at all", template(`<Button v-bind="$attrs" />`)],
    [
      "an options object",
      `<script lang="ts">\n${buttonImport}\nexport default {}\n</script>\n\n${template(`<Button v-bind="$attrs" />`)}`,
    ],
  ])("the file itself is the default export: %s", (_name, source) => {
    const { write, button } = temporaryProject()
    const file = write("components/Wrapper.vue", source)
    expect(wrapperTargetOf(file, "default")).toEqual({
      component: "Button",
      file: button,
    })
  })

  test("answers from the supplied SFC, not from the file on disk", () => {
    const { write, button } = temporaryProject()
    const file = write("components/Wrapper.vue", template(`<section />`))
    const parsed = parsedOf(
      sfc(buttonImport, `<Button v-bind="$attrs" />`),
      file
    )
    expect(wrapperTargetOf(file, "default", [], parsed)).toEqual({
      component: "Button",
      file: button,
    })
  })

  test("inherits the same contract through a chain of wrappers", () => {
    tester.run("no-restyle", rule, {
      valid: [],
      invalid: [
        {
          filename: PAGE,
          code: sfc(primaryAction, `<PrimaryAction class="rounded-full" />`),
          errors: [
            {
              messageId: "appearanceClassViaWrapper",
              data: {
                className: "rounded-full",
                component: "Button",
                category: "shape",
                wrapper: "PrimaryAction",
                variants:
                  "default, outline, secondary, ghost, destructive, link",
                variantsSuffix:
                  ": default, outline, secondary, ghost, destructive, link",
                file: "test/fixtures/project/components/ui/button/Button.vue",
                where:
                  "in test/fixtures/project/components/ui/button/Button.vue",
              },
            },
          ],
        },
      ],
    })
  })
})

describe("no-restyle through wrappers", () => {
  test("the target's contract and variants apply", () => {
    tester.run("no-restyle", rule, {
      valid: [
        // Layout opened for Button reaches it through the wrapper.
        {
          filename: PAGE,
          options: [{ allow: ["layout"] }],
          code: sfc(
            saveButton,
            `<SaveButton class="mt-4 w-full">Go</SaveButton>`
          ),
        },
        {
          filename: PAGE,
          code: sfc(
            section,
            `<Section class="bg-muted rounded-xl">Hi</Section>`
          ),
        },
      ],
      invalid: [
        {
          filename: PAGE,
          code: sfc(
            saveButton,
            `<SaveButton class="bg-red-500">Go</SaveButton>`
          ),
          errors: [
            {
              messageId: "appearanceClassViaWrapper",
              data: {
                className: "bg-red-500",
                component: "Button",
                category: "color",
                wrapper: "SaveButton",
                variants:
                  "default, outline, secondary, ghost, destructive, link",
                variantsSuffix:
                  ": default, outline, secondary, ghost, destructive, link",
                file: "test/fixtures/project/components/ui/button/Button.vue",
                where:
                  "in test/fixtures/project/components/ui/button/Button.vue",
              },
            },
          ],
        },
        {
          filename: PAGE,
          code: sfc(primaryAction, `<PrimaryAction class="rounded-full" />`),
          errors: [{ messageId: "appearanceClassViaWrapper" }],
        },
        {
          filename: PAGE,
          code: sfc(cancelButton, `<CancelButton class="text-xs" />`),
          errors: [{ messageId: "appearanceClassViaWrapper" }],
        },
      ],
    })
  })
})

describe("wrappers", () => {
  test("a class the component wears itself is not forwarding", () => {
    expect(wrapperTargetOf(FIXED_BUTTON, "FixedButton")).toBeNull()
    expect(wrapperTargetOf(SAVE_BUTTON, "SaveButton")?.component).toBe("Button")
  })

  test("the wrapper message names the target's file", () => {
    tester.run("no-restyle", rule, {
      valid: [],
      invalid: [
        {
          filename: PAGE,
          code: sfc(saveButton, `<SaveButton class="text-xs">Go</SaveButton>`),
          errors: [
            {
              message:
                /<SaveButton> passes its class to <Button>.*Add a new variant in test\/fixtures\/project\/components\/ui\/button\/Button\.vue/,
            },
          ],
        },
      ],
    })
  })
})
