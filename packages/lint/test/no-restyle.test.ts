import { describe, test } from "vitest"

import { noRestyle } from "../src/rules/no-restyle"
import { button, card, createTester, OUTSIDE, PAGE, sfc } from "./helpers"

const tester = createTester()
const rule = noRestyle as any

// Nothing crosses until config says so. Most cases open layout at the
// top level, the policy a project starts from, and test the boundary
// from there.
const layout = [{ allow: ["layout"] }]

describe("no-restyle", () => {
  test("layout crosses when allowed, appearance does not", () => {
    tester.run("no-restyle", rule, {
      valid: [
        {
          filename: PAGE,
          options: layout,
          code: sfc(
            button,
            `<Button class="mt-4 w-full col-start-2 hidden md:inline-flex">Go</Button>`
          ),
        },
        {
          filename: PAGE,
          code: sfc(button, `<Button variant="destructive">Go</Button>`),
        },
        // Plain elements and unknown components are unrestricted.
        {
          filename: PAGE,
          code: sfc("", `<div class="bg-red-500 rounded-full" />`),
        },
        {
          filename: PAGE,
          code: sfc(
            `import { Hero } from "./hero"`,
            `<Hero class="bg-muted" />`
          ),
        },
        {
          filename: PAGE,
          options: layout,
          code: sfc(
            `${button}\nconst props = defineProps<{ class?: string }>()`,
            `<Button :class="cn('w-full', props.class)">Go</Button>`
          ),
        },
        // Outside a project nothing is a design-system component.
        {
          filename: OUTSIDE,
          code: sfc(button, `<Button class="bg-red-500">Go</Button>`),
        },
      ],
      invalid: [
        // With no allow list, placement is a finding too, and it says so
        // in its own words rather than through the variant ladder.
        {
          filename: PAGE,
          code: sfc(button, `<Button class="mt-4 bg-red-500">Go</Button>`),
          errors: [
            { messageId: "layoutClassClosed" },
            { messageId: "appearanceClassWithVariants" },
          ],
        },
        {
          filename: PAGE,
          options: layout,
          code: sfc(
            button,
            `<Button class="bg-red-500 rounded-full">Go</Button>`
          ),
          errors: [
            { messageId: "appearanceClassWithVariants" },
            { messageId: "appearanceClassWithVariants" },
          ],
        },
        // Recognized by name: a re-export from outside /ui/ is still Button.
        {
          filename: PAGE,
          options: layout,
          code: sfc(
            `import { Button } from "@/components/widgets"`,
            `<Button class="text-xs">Go</Button>`
          ),
          errors: [{ messageId: "appearanceClassWithVariants" }],
        },
        // An arbitrary property that paints or casts a shadow is
        // appearance; layout does not open it. Margin stays layout.
        {
          filename: PAGE,
          options: layout,
          code: sfc(
            button,
            `<Button class="[margin:1rem] [background:red] [border-top-color:red] [text-shadow:0_0_1px_red] [border:1px_solid_red]">Go</Button>`
          ),
          errors: [
            {
              message:
                /"\[background:red\]" is not allowed on <Button>: <Button> owns its color/,
            },
            {
              message:
                /"\[border-top-color:red\]" is not allowed on <Button>: <Button> owns its color/,
            },
            {
              message:
                /"\[text-shadow:0_0_1px_red\]" is not allowed on <Button>: <Button> owns its effects/,
            },
            {
              message:
                /"\[border:1px_solid_red\]" is not allowed on <Button>: <Button> owns its shape/,
            },
          ],
        },
        {
          filename: PAGE,
          options: layout,
          code: sfc(
            `import { cn } from "@/lib/utils"\n${button}`,
            `<Button :class="cn('w-full', 'shadow-lg')">Go</Button>`
          ),
          errors: [{ messageId: "appearanceClassWithVariants" }],
        },
        {
          filename: PAGE,
          options: layout,
          code: sfc(
            `${button}\nconst on = true`,
            `<Button :class="on ? 'bg-accent' : 'mt-2'">Go</Button>`
          ),
          errors: [{ messageId: "appearanceClassWithVariants" }],
        },
        {
          filename: PAGE,
          options: layout,
          code: sfc(button, `<Button class="hover:bg-emerald-500">Go</Button>`),
          errors: [{ messageId: "appearanceClassWithVariants" }],
        },
        // Closed widgets do not take spacing; the message offers sizes.
        {
          filename: PAGE,
          options: layout,
          code: sfc(button, `<Button class="p-0">Go</Button>`),
          errors: [{ messageId: "spacingClassWithSizes" }],
        },
        // A spread that carries the class is a boundary too.
        {
          filename: PAGE,
          options: layout,
          code: sfc(
            button,
            `<Button v-bind="{ class: 'bg-red-500' }">Go</Button>`
          ),
          errors: [{ messageId: "appearanceClassWithVariants" }],
        },
      ],
    })
  })

  test("one-hop resolution keeps the component context", () => {
    tester.run("no-restyle", rule, {
      valid: [
        {
          filename: PAGE,
          options: layout,
          code: sfc(
            `${button}\nconst cls = "mt-4 w-full"`,
            `<Button :class="cls">Go</Button>`
          ),
        },
      ],
      invalid: [
        {
          filename: PAGE,
          options: layout,
          code: sfc(
            `${button}\nconst active = true\nconst tone = active ? "bg-primary" : "mt-2"`,
            `<Button :class="tone">Go</Button>`
          ),
          errors: [{ messageId: "appearanceClassWithVariants" }],
        },
      ],
    })
  })

  test("open containers accept spacing when a contract opens them", () => {
    // The policy the old default shipped, written where it can be read.
    const options = [
      {
        allow: ["layout"],
        contracts: [
          {
            pattern: "^Card$|(Content|Header|Footer|Group|Panel)$",
            allow: ["layout", "spacing"],
          },
        ],
      },
    ]
    tester.run("no-restyle", rule, {
      valid: [
        {
          filename: PAGE,
          options,
          code: sfc(
            card,
            `<Card class="p-0"><CardContent class="px-2 pt-4 md:px-6">Hi</CardContent></Card>`
          ),
        },
      ],
      invalid: [
        {
          filename: PAGE,
          options,
          code: sfc(
            card,
            `<CardContent class="px-2 rounded-xl text-xs">Hi</CardContent>`
          ),
          errors: [
            { messageId: "appearanceClassNoVariants" },
            { messageId: "appearanceClassNoVariants" },
          ],
        },
        // Without the contract, spacing on a slot is a finding like any other.
        {
          filename: PAGE,
          options: layout,
          code: sfc(card, `<CardContent class="px-2">Hi</CardContent>`),
          errors: [{ messageId: "spacingClassNoSizes" }],
        },
      ],
    })
  })

  test("contracts: allow, deny, and replacing the top-level policy", () => {
    tester.run("no-restyle", rule, {
      valid: [
        // Class globs match the base utility at every breakpoint.
        {
          filename: PAGE,
          code: sfc(
            card,
            `<CardTitle class="p-2 md:p-4 hover:!px-3">Hi</CardTitle>`
          ),
          options: [
            { contracts: [{ pattern: "^CardTitle$", allow: ["p-*", "px-*"] }] },
          ],
        },
        // A cn group id allows every value of that utility.
        {
          filename: PAGE,
          code: sfc(button, `<Button class="rounded-full">Go</Button>`),
          options: [
            { contracts: [{ pattern: "^Button$", allow: ["rounded"] }] },
          ],
        },
        // A contract's allow is the whole list for the components it
        // names; it does not add to the top-level one.
        {
          filename: PAGE,
          code: sfc(button, `<Button class="w-full w-[320px]">Go</Button>`),
          options: [
            {
              allow: ["layout"],
              contracts: [{ pattern: "^Button$", allow: ["w-*"] }],
            },
          ],
        },
        // Opacity modifiers are ignored when matching.
        {
          filename: PAGE,
          code: sfc(button, `<Button class="bg-primary/50">Go</Button>`),
          options: [
            { contracts: [{ pattern: "^Button$", allow: ["bg-primary"] }] },
          ],
        },
        // The last matching contract is the policy; earlier ones do not merge in.
        {
          filename: PAGE,
          code: sfc(button, `<Button class="mt-4">Go</Button>`),
          options: [
            {
              contracts: [
                { pattern: "^Button$", allow: ["color"] },
                { pattern: "Button", allow: ["layout"] },
              ],
            },
          ],
        },
      ],
      invalid: [
        // deny subtracts from the contract's own allow, at every
        // breakpoint and with markers.
        {
          filename: PAGE,
          code: sfc(
            card,
            `<CardContent class="md:p-0 hover:!px-0 p-4">Hi</CardContent>`
          ),
          options: [
            {
              contracts: [
                {
                  pattern: "^CardContent$",
                  allow: ["spacing"],
                  deny: ["p-0", "px-0"],
                },
              ],
            },
          ],
          errors: [{ messageId: "deniedClass" }, { messageId: "deniedClass" }],
        },
        // A pattern with a colon matches only that variant form.
        {
          filename: PAGE,
          code: sfc(card, `<CardContent class="md:p-0 p-0">Hi</CardContent>`),
          options: [
            {
              contracts: [
                {
                  pattern: "^CardContent$",
                  allow: ["spacing"],
                  deny: ["md:p-*"],
                },
              ],
            },
          ],
          errors: [{ messageId: "deniedClass" }],
        },
        // A contract replaces the top-level allow: layout opened there
        // does not reach a component whose contract leaves it out.
        {
          filename: PAGE,
          code: sfc(button, `<Button class="mt-4">Go</Button>`),
          options: [
            {
              allow: ["layout"],
              contracts: [{ pattern: "^Button$", allow: ["w-*"] }],
            },
          ],
          errors: [
            {
              messageId: "layoutClass",
              data: { className: "mt-4", component: "Button", entries: "w-*" },
            },
          ],
        },
        // The last matching contract decides; the color one is shadowed.
        {
          filename: PAGE,
          code: sfc(button, `<Button class="bg-red-500">Go</Button>`),
          options: [
            {
              contracts: [
                { pattern: "^Button$", allow: ["color"] },
                { pattern: "Button", allow: ["layout"] },
              ],
            },
          ],
          errors: [{ messageId: "appearanceClassWithVariants" }],
        },
        // A contract with only a message keeps the top-level list and
        // speaks for its components: mt-4 passes, px-2 gets its words.
        {
          filename: PAGE,
          code: sfc(card, `<CardContent class="px-2 mt-4">Hi</CardContent>`),
          options: [
            {
              allow: ["layout"],
              contracts: [
                {
                  pattern: "^CardContent$",
                  message:
                    "<CardContent> takes layout from outside, not {{className}}.",
                },
              ],
            },
          ],
          errors: [
            { message: "<CardContent> takes layout from outside, not px-2." },
          ],
        },
        // Allowing a boundary never bypasses the vocabulary rules, but
        // the boundary itself is open: p-[13px] passes here.
        {
          filename: PAGE,
          code: sfc(card, `<CardTitle class="p-[13px] text-xs">Hi</CardTitle>`),
          options: [
            { contracts: [{ pattern: "^CardTitle$", allow: ["p-*"] }] },
          ],
          errors: [{ messageId: "appearanceClassNoVariants" }],
        },
      ],
    })
  })

  test("componentImports works without a project", () => {
    tester.run("no-restyle", rule, {
      valid: [],
      invalid: [
        {
          filename: OUTSIDE,
          code: sfc(
            `import { Button } from "@acme/ui"`,
            `<Button class="bg-red-500">Go</Button>`
          ),
          options: [{ componentImports: ["^@acme/ui"] }],
          errors: [{ messageId: "appearanceClass" }],
        },
      ],
    })
  })
})

describe("contract entries that are both a class and a group", () => {
  test("flex opens the class and the group", () => {
    tester.run("no-restyle", noRestyle as any, {
      valid: [
        {
          filename: PAGE,
          code: sfc(
            card,
            `<CardTitle class="flex flex-1 text-xs">Hi</CardTitle>`
          ),
          options: [
            {
              contracts: [
                { pattern: "^CardTitle$", allow: ["flex", "typography"] },
              ],
            },
          ],
        },
      ],
      invalid: [
        {
          filename: PAGE,
          code: sfc(button, `<Button class="flex flex-1">Go</Button>`),
          options: [
            {
              contracts: [
                { pattern: "^Button$", allow: ["layout"], deny: ["flex"] },
              ],
            },
          ],
          errors: [{ messageId: "deniedClass" }, { messageId: "deniedClass" }],
        },
      ],
    })
  })
})
