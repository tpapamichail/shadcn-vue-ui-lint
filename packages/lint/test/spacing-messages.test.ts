import { describe, expect, test } from "vitest"

import { noRestyle } from "../src/rules/no-restyle"
import { button, card, createTester, PAGE, sfc } from "./helpers"

const tester = createTester()
const rule = noRestyle as any
const field = `import { Field, FieldLabel } from "@/components/ui/field"`
const cardHeader = `import { CardHeader, CardTitle } from "@/components/ui/card"`
const saveButton = `import SaveButton from "@/components/SaveButton.vue"`

// The policy the old default shipped, written out: layout everywhere,
// and spacing on Card and its slots. Nothing ships now, so a contract
// that opens containers is the project's own and names them like any
// other contract would.
const layout = { allow: ["layout"] }
const openContainers = {
  pattern: "^Card$|(Content|Header|Footer|Group|Panel)$",
  allow: ["layout", "spacing"],
}
const options = [{ ...layout, contracts: [openContainers] }]

// The fixture index has four components the contract opens, so they
// are listed after the container clause; five would be a pattern.
const containers = "Card, CardHeader, CardFooter and CardContent"

// Spacing findings: sizes first when the component has a size axis,
// then where space around it goes, then the component itself. Nothing
// is named by convention; only the contracts the project wrote add names.
describe("spacing messages", () => {
  test("a component with a size axis is offered its sizes", () => {
    tester.run("no-restyle", rule, {
      valid: [],
      invalid: [
        {
          filename: PAGE,
          options: [layout],
          code: sfc(button, `<Button class="p-4 mt-4">Go</Button>`),
          errors: [
            {
              message:
                /^"p-4" is not allowed on <Button>: <Button> owns its spacing\. Use a size \(default, xs, sm, lg, icon, icon-xs, icon-sm, icon-lg\), or margin here or gap on the parent for space around it\. Add a size in test\/fixtures\/project\/components\/ui\/button\/Button\.vue only if the design explicitly calls for one\.$/,
            },
          ],
        },
        {
          filename: PAGE,
          options: [layout],
          code: sfc(button, `<Button class="gap-2">Go</Button>`),
          errors: [{ messageId: "spacingClassWithSizes" }],
        },
      ],
    })
  })

  test("without a size axis only layout is offered", () => {
    tester.run("no-restyle", rule, {
      valid: [],
      invalid: [
        // No variant definition in the file, no enclosing container.
        {
          filename: PAGE,
          options: [layout],
          code: sfc(card, `<CardTitle class="pb-2">Hi</CardTitle>`),
          errors: [
            {
              message:
                /^"pb-2" is not allowed on <CardTitle>: <CardTitle> owns its spacing\. For space around it, use margin here or gap on the parent\.$/,
            },
          ],
        },
        // A variant axis, but no size axis.
        {
          filename: PAGE,
          options: [layout],
          code: sfc(field, `<FieldLabel class="px-2">Hi</FieldLabel>`),
          errors: [
            {
              message:
                /^"px-2" is not allowed on <FieldLabel>: <FieldLabel> owns its spacing\. For space around it, use margin here or gap on the parent\.$/,
            },
          ],
        },
      ],
    })
  })

  test("margin is offered only when the contract allows it", () => {
    tester.run("no-restyle", rule, {
      valid: [],
      invalid: [
        // A closed contract: no margin here, only the parent.
        {
          filename: PAGE,
          code: sfc(button, `<Button class="p-4">Go</Button>`),
          errors: [
            { message: /, or gap on the parent for space around it\. Add/ },
          ],
        },
      ],
    })
  })

  test("the enclosing element that accepts the class is named", () => {
    tester.run("no-restyle", rule, {
      valid: [],
      invalid: [
        // The direct parent accepts spacing: it replaces "the parent".
        {
          filename: PAGE,
          options,
          code: sfc(
            cardHeader,
            `<CardHeader><CardTitle class="pb-2">Hi</CardTitle></CardHeader>`
          ),
          errors: [
            {
              message: new RegExp(
                // The named container is not listed again.
                `^"pb-2" is not allowed on <CardTitle>: <CardTitle> owns its spacing\\. For space around it, use margin here, spacing on <CardHeader>, or Card, CardFooter and CardContent\\.$`
              ),
            },
          ],
        },
        // Further up: the parent line stays and the container is added.
        {
          filename: PAGE,
          options,
          code: sfc(
            `${button}\n${card}`,
            `<CardContent><div><Button class="p-4">Go</Button></div></CardContent>`
          ),
          errors: [
            {
              message: new RegExp(
                `, or margin here, gap on the parent, spacing on <CardContent>, or Card, CardHeader and CardFooter for space around it\\. Add a size`
              ),
            },
          ],
        },
        // A v-if inserts no parent: the class still goes to the
        // enclosing container.
        {
          filename: PAGE,
          options,
          code: sfc(
            `${button}\n${card}\nconst on = true`,
            `<CardContent><Button v-if="on" class="p-4">Go</Button></CardContent>`
          ),
          errors: [
            {
              message: new RegExp(
                `or margin here, spacing on <CardContent>, or Card, CardHeader and CardFooter for space around it\\. Add`
              ),
            },
          ],
        },
        // An enclosing element that does not accept the class is skipped.
        {
          filename: PAGE,
          options,
          code: sfc(
            field,
            `<Field><FieldLabel class="px-2">Hi</FieldLabel></Field>`
          ),
          // Field is the direct parent and rejects spacing, so the finding
          // does not send the class there.
          errors: [
            {
              message: new RegExp(
                `use margin here, gap on a plain wrapper around it, or ${containers}\\.$`
              ),
            },
          ],
        },
        // A wrapper of an open container is named as written.
        {
          filename: PAGE,
          options,
          code: sfc(
            `${button}\nimport Panel from "@/components/Panel.vue"`,
            `<Panel><Button class="p-4">Go</Button></Panel>`
          ),
          errors: [
            {
              message: new RegExp(
                `or margin here, spacing on <Panel>, or ${containers} for space around it\\. Add`
              ),
            },
          ],
        },
        // Margin denied and a direct container: the container leads.
        {
          filename: PAGE,
          options: [
            {
              ...layout,
              contracts: [
                openContainers,
                { pattern: "^CardTitle$", allow: ["layout"], deny: ["m-*"] },
              ],
            },
          ],
          code: sfc(
            cardHeader,
            `<CardHeader><CardTitle class="pb-2">Hi</CardTitle></CardHeader>`
          ),
          errors: [
            {
              message: new RegExp(
                `For space around it, use spacing on <CardHeader> or Card, CardFooter and CardContent\\.$`
              ),
            },
          ],
        },
      ],
    })
  })

  test("the wrapper form keeps the wrapper clause", () => {
    tester.run("no-restyle", rule, {
      valid: [],
      invalid: [
        {
          filename: PAGE,
          options: [layout],
          code: sfc(saveButton, `<SaveButton class="py-1">Go</SaveButton>`),
          errors: [
            {
              message:
                /^"py-1" is not allowed on <SaveButton>: <SaveButton> passes its class to <Button>, which owns its spacing\. Use a size \(default, .*\), or margin here or gap on the parent for space around it\. Add a size in .*ui\/button\/Button\.vue/,
            },
          ],
        },
      ],
    })
  })

  test("margin leaves the layout line when a contract denies it", () => {
    tester.run("no-restyle", rule, {
      valid: [],
      invalid: [
        {
          filename: PAGE,
          options: [
            {
              ...layout,
              contracts: [
                { pattern: "^Button$", allow: ["layout"], deny: ["m-*"] },
              ],
            },
          ],
          code: sfc(button, `<Button class="p-4 m-2">Go</Button>`),
          errors: [
            {
              message: /, or gap on the parent for space around it\. Add/,
            },
            { messageId: "deniedClass" },
          ],
        },
      ],
    })
  })

  test("contracts the project wrote name layout primitives", () => {
    tester.run("no-restyle", rule, {
      valid: [],
      invalid: [
        // A literal pattern names its components, in the order written,
        // whether or not they exist in the index.
        {
          filename: PAGE,
          options: [
            {
              ...layout,
              contracts: [{ pattern: "^(Row|Stack|Box)$", allow: ["spacing"] }],
            },
          ],
          code: sfc(button, `<Button class="p-4">Go</Button>`),
          errors: [
            {
              message:
                /, or margin here, gap on the parent, or Row, Stack and Box for space around it\. Add/,
            },
          ],
        },
        // A non-literal pattern is matched against the component index.
        {
          filename: PAGE,
          options: [
            {
              ...layout,
              contracts: [{ pattern: "^Fie.d$", allow: ["spacing"] }],
            },
          ],
          code: sfc(button, `<Button class="p-4">Go</Button>`),
          errors: [
            {
              message:
                /or margin here, gap on the parent, or Field for space around it\. Add/,
            },
          ],
        },
        // Two names read as a pair; margin denied still lists them.
        {
          filename: PAGE,
          options: [
            {
              ...layout,
              contracts: [
                { pattern: "^(Row|Stack)$", allow: ["spacing"] },
                { pattern: "^Button$", allow: ["layout"], deny: ["m-*"] },
              ],
            },
          ],
          code: sfc(button, `<Button class="p-4">Go</Button>`),
          errors: [
            {
              message:
                /, or gap on the parent or Row and Stack for space around it\. Add/,
            },
          ],
        },
        // A contract that grants only another category names nothing.
        {
          filename: PAGE,
          options: [
            {
              ...layout,
              contracts: [{ pattern: "^(Row|Stack)$", allow: ["color"] }],
            },
          ],
          code: sfc(button, `<Button class="p-4">Go</Button>`),
          errors: [
            {
              message:
                /, or margin here or gap on the parent for space around it\. Add/,
            },
          ],
        },
        // More than four matches is a pattern, not a list: omitted.
        {
          filename: PAGE,
          options: [
            { ...layout, contracts: [{ pattern: "Card", allow: ["spacing"] }] },
          ],
          code: sfc(button, `<Button class="p-4">Go</Button>`),
          errors: [
            {
              message:
                /, or margin here or gap on the parent for space around it\. Add/,
            },
          ],
        },
        // The open-container contract names the containers it opens, in
        // index order, and not the component being restyled.
        {
          filename: PAGE,
          options,
          code: sfc(card, `<CardTitle class="p-4">Hi</CardTitle>`),
          errors: [
            {
              message: new RegExp(
                `use margin here, gap on the parent, or ${containers}\\.$`
              ),
            },
          ],
        },
      ],
    })
  })

  test("a contract message replaces the spacing text, with the sizes to hand", () => {
    tester.run("no-restyle", rule, {
      valid: [],
      invalid: [
        {
          filename: PAGE,
          options: [
            {
              contracts: [
                {
                  pattern: "^Button$",
                  message: {
                    spacing: "Padding on a Button is its size: {{sizes}}.",
                  },
                },
              ],
            },
          ],
          code: sfc(button, `<Button class="p-4">Go</Button>`),
          errors: [
            {
              message:
                "Padding on a Button is its size: default, xs, sm, lg, icon, icon-xs, icon-sm, icon-lg.",
            },
          ],
        },
      ],
    })
  })

  test("a component recognized by pattern without a file gets layout only", () => {
    tester.run("no-restyle", rule, {
      valid: [],
      invalid: [
        {
          filename: PAGE,
          options: [{ ...layout, componentImports: ["^@acme/kit"] }],
          code: sfc(
            `import { Chip } from "@acme/kit"`,
            `<Chip class="px-3">Hi</Chip>`
          ),
          errors: [
            {
              message:
                /^"px-3" is not allowed on <Chip>: <Chip> owns its spacing\. For space around it, use margin here or gap on the parent\.$/,
            },
          ],
        },
      ],
    })
  })

  test("other categories keep their variant ladder", () => {
    tester.run("no-restyle", rule, {
      valid: [],
      invalid: [
        {
          filename: PAGE,
          code: sfc(button, `<Button class="bg-red-500">Go</Button>`),
          errors: [{ messageId: "appearanceClassWithVariants" }],
        },
      ],
    })
  })
})

describe("size axis reader", () => {
  test("reads the size axis and nothing else", async () => {
    const { sizeNamesFor, variantNamesFor } =
      await import("../src/project/variants")
    const path = await import("node:path")
    const { PROJECT } = await import("./helpers")
    const buttonFile = path.join(PROJECT, "components/ui/button/Button.vue")
    expect(sizeNamesFor(buttonFile, "Button")).toEqual([
      "default",
      "xs",
      "sm",
      "lg",
      "icon",
      "icon-xs",
      "icon-sm",
      "icon-lg",
    ])
    expect(variantNamesFor(buttonFile, "Button")).toContain("destructive")
    const fieldFile = path.join(PROJECT, "components/ui/field/FieldLabel.vue")
    expect(sizeNamesFor(fieldFile, "FieldLabel")).toBeNull()
    expect(variantNamesFor(fieldFile, "FieldLabel")).toEqual([
      "default",
      "muted",
    ])
  })
})