// The complete policy from docs/rules.md, a design team's rules for a
// shadcn install, run against the fixture project. It exercises what a
// single-contract test cannot: a top-level policy under contracts that
// restate it, a component with no variants, a component no contract
// names, and which words a finding gets. Keep the config in step with
// the docs.

import tsParser from "@typescript-eslint/parser"
import { Linter } from "eslint"
import { describe, expect, test } from "vitest"
import vueParser from "vue-eslint-parser"

import { plugin } from "../src/index"
import { PAGE, PROJECT, sfc } from "./helpers"

// A contract is its components' whole policy, so each one that keeps
// the top-level rules says so again.
const MARGINS = [
  "m",
  "mx",
  "my",
  "ms",
  "me",
  "mbs",
  "mbe",
  "mt",
  "mr",
  "mb",
  "ml",
]
const NO_MARGINS =
  "No margins on <{{component}}>. Space between components is the container's: use gap, or a Stack."
const VARIANTS_ONLY =
  "Appearance on <{{component}}> comes from its variants: {{variants|none yet}}. Add one in {{file}} if the design calls for it."

const policy = {
  // Every component may be placed on the page; none carries its own margin.
  allow: ["layout"],
  deny: MARGINS,
  contracts: [
    // Containers own their padding.
    {
      pattern: "^Card$|(Content|Header|Footer|Group|Panel)$",
      allow: ["layout", "spacing"],
      deny: MARGINS,
      message: { layout: NO_MARGINS, default: VARIANTS_ONLY },
    },
    {
      pattern: "^(Alert|ScrollArea|SidebarInset|TabsList|Toolbar)$",
      allow: ["layout", "spacing"],
      deny: MARGINS,
      message: { layout: NO_MARGINS, default: VARIANTS_ONLY },
    },
    {
      pattern: "(Title|Description)$|^Label$|^FormLabel$",
      allow: ["layout", "typography"],
      deny: MARGINS,
      message: {
        layout: NO_MARGINS,
        color:
          "Text color on <{{component}}> is a token through a variant, not a class.",
        default: VARIANTS_ONLY,
      },
    },
    {
      pattern: "^Table(Head|Cell)$",
      allow: ["layout", "font-weight", "tabular-nums", "lining-nums"],
      deny: MARGINS,
    },
    { pattern: "^TableRow$", allow: ["layout", "bg-color"], deny: MARGINS },
    {
      pattern: "^(Input|Textarea|SelectTrigger)$",
      allow: ["layout", "font-mono"],
      deny: MARGINS,
    },
    {
      pattern: "^Avatar$",
      allow: ["size-*"],
      message:
        'An <{{component}}> takes a size (size-8, size-10) and nothing else; "{{className}}" is not a size.',
    },
    {
      pattern: "^Badge$",
      allow: ["layout"],
      deny: MARGINS,
      message: {
        layout: NO_MARGINS,
        default:
          'A <{{component}}> is one of its variants: {{variants}}. "{{className}}" is not a variant.',
      },
    },
    { pattern: "^Skeleton$", allow: ["layout", "rounded"], deny: MARGINS },
    {
      pattern: "^Button$",
      allow: ["layout"],
      deny: [...MARGINS, "w-*", "min-w-*", "max-w-*", "size-*"],
      message: {
        layout:
          "\"{{className}}\" is not a <{{component}}>'s to set: it sizes to its label, and space around it is the container's. Put w-full on the form row and use gap between controls.",
        spacing: "Padding on a <{{component}}> is its size: {{sizes}}.",
        color:
          "Button color is a variant: {{variants}}. A new treatment is a new variant in {{file}}, not a class.",
      },
    },
  ],
}

const BUTTON_LAYOUT = (className: string) =>
  `"${className}" is not a <Button>'s to set: it sizes to its label, and space around it is the container's. Put w-full on the form row and use gap between controls.`

const cases: [string, string | null][] = [
  ['<Button class="mt-4">Go</Button>', BUTTON_LAYOUT("mt-4")],
  ['<Button class="mbs-4">Go</Button>', BUTTON_LAYOUT("mbs-4")],
  ['<Button class="w-full">Go</Button>', BUTTON_LAYOUT("w-full")],
  ['<Button class="size-10">Go</Button>', BUTTON_LAYOUT("size-10")],
  [
    '<Button class="p-6">Go</Button>',
    "Padding on a <Button> is its size: default, xs, sm, lg, icon, icon-xs, icon-sm, icon-lg.",
  ],
  [
    '<Button class="bg-red-500">Go</Button>',
    "Button color is a variant: default, outline, secondary, ghost, destructive, link. A new treatment is a new variant in components/ui/button/Button.vue, not a class.",
  ],
  ['<Button class="col-span-2 self-end">Go</Button>', null],
  [
    '<CardTitle class="text-xs font-medium tracking-tight">Hi</CardTitle>',
    null,
  ],
  [
    '<CardTitle class="text-red-500">Hi</CardTitle>',
    "Text color on <CardTitle> is a token through a variant, not a class.",
  ],
  // A contract that restates the margin rule reports it in the same words.
  [
    '<CardTitle class="mt-4">Hi</CardTitle>',
    "No margins on <CardTitle>. Space between components is the container's: use gap, or a Stack.",
  ],
  ['<CardContent class="px-2 pt-0">Hi</CardContent>', null],
  [
    '<Card class="shadow-lg">Hi</Card>',
    "Appearance on <Card> comes from its variants: none yet. Add one in components/ui/card/Card.vue if the design calls for it.",
  ],
  // A component no contract names takes the top-level policy, which has
  // no words of its own.
  ['<Field class="w-full" />', null],
  [
    '<Field class="mt-4" />',
    `"mt-4" is not allowed on <Field>: its contract denies ${MARGINS.join(" ")}.`,
  ],
]

const IMPORTS = [
  `import { Button } from "@/components/ui/button"`,
  `import { Card, CardContent, CardTitle } from "@/components/ui/card"`,
  `import { Field } from "@/components/ui/field"`,
].join("\n")

describe("a complete policy for a shadcn install", () => {
  const linter = new Linter({ cwd: PROJECT })
  test.each(cases)("%s", (markup, expected) => {
    const messages = linter.verify(
      sfc(IMPORTS, markup),
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
          rules: { "shadcn-vue/no-restyle": ["error", policy] },
        },
      ] as unknown as Linter.Config[],
      { filename: PAGE }
    )
    if (expected === null) expect(messages).toEqual([])
    else expect(messages.map((m) => m.message)).toEqual([expected])
  })
})
