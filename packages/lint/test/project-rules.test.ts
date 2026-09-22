// The rules against projects the index alone cannot describe: no
// components.json, monorepo aliases, ignored imports, extra helpers.

import * as path from "node:path"
import { describe, test } from "vitest"

import { noRawColors } from "../src/rules/no-raw-colors"
import { noRestyle } from "../src/rules/no-restyle"
import { requireStaticClasses } from "../src/rules/require-static-classes"
import { button, createTester, PAGE, sfc, template } from "./helpers"

const FIXTURES = path.join(__dirname, "fixtures")
const NO_JSON_PAGE = path.join(FIXTURES, "no-json/src/app/page.vue")
const WEB_PAGE = path.join(FIXTURES, "monorepo/apps/web/app/page.vue")
const ADMIN_PAGE = path.join(FIXTURES, "monorepo/apps/admin/app/page.vue")

const tester = createTester()
const boundary = noRestyle as any
const ds = [{ componentImports: ["(^|/|#)ds(/|$)"] }]

const buttonError = (file: string) => ({
  messageId: "appearanceClassWithVariants",
  data: {
    className: "bg-highlight",
    component: "Button",
    category: "color",
    variants: "primary, secondary",
    file,
  },
})

describe("variants resolve through imports without components.json", () => {
  test("alias, relative, package imports, barrels", () => {
    const file = "test/fixtures/no-json/src/ds/button/Button.vue"
    tester.run("no-restyle", boundary, {
      valid: [],
      invalid: [
        {
          filename: NO_JSON_PAGE,
          code: sfc(
            `import { Button } from "@/ds"`,
            `<Button class="bg-highlight">Go</Button>`
          ),
          options: ds,
          errors: [buttonError(file)],
        },
        {
          filename: NO_JSON_PAGE,
          code: sfc(
            `import { Button } from "../ds/button"`,
            `<Button class="bg-highlight">Go</Button>`
          ),
          options: ds,
          errors: [buttonError(file)],
        },
        // The namespace case is dropped: a member tag (<DS.Button>) has
        // no Vue template form.
        {
          filename: NO_JSON_PAGE,
          code: sfc(
            `import { Button } from "#ds"`,
            `<Button class="bg-highlight">Go</Button>`
          ),
          options: ds,
          errors: [buttonError(file)],
        },
        // A component with a file but no variant axis names the file.
        {
          filename: NO_JSON_PAGE,
          code: sfc(
            `import { CardBody } from "@/ds"`,
            `<CardBody class="text-xs">Hi</CardBody>`
          ),
          options: ds,
          errors: [
            {
              messageId: "appearanceClassNoVariants",
              data: {
                className: "text-xs",
                component: "CardBody",
                category: "typography",
                variants: "",
                file: "test/fixtures/no-json/src/ds/card/CardBody.vue",
              },
            },
          ],
        },
        // An import that resolves nowhere keeps the generic message.
        {
          filename: NO_JSON_PAGE,
          code: sfc(
            `import { Button } from "@acme/ui"`,
            `<Button class="bg-highlight">Go</Button>`
          ),
          options: [{ componentImports: ["^@acme/ui"] }],
          errors: [{ messageId: "appearanceClass" }],
        },
      ],
    })
  })
})

describe("monorepo aliases", () => {
  test("variants and file through tsconfig paths and package exports", () => {
    const error = {
      messageId: "appearanceClassWithVariants",
      data: {
        className: "bg-red-500",
        component: "Button",
        category: "color",
        variants: "default, brand",
        file: "test/fixtures/monorepo/packages/ui/src/components/button/Button.vue",
      },
    }
    const code = sfc(
      `import { Button } from "@workspace/ui/components/button"`,
      `<Button class="bg-red-500">Go</Button>`
    )
    tester.run("no-restyle", boundary, {
      valid: [],
      invalid: [
        { filename: WEB_PAGE, code, errors: [error] },
        { filename: ADMIN_PAGE, code, errors: [error] },
      ],
    })
  })
})

describe("no-raw-colors names the theme file", () => {
  test("discovered theme and imported workspace theme", () => {
    tester.run("no-raw-colors", noRawColors as any, {
      valid: [
        {
          filename: NO_JSON_PAGE,
          code: template(`<div class="bg-accent text-ink-muted" />`),
        },
      ],
      invalid: [
        {
          filename: NO_JSON_PAGE,
          code: template(`<div class="bg-highlight" />`),
          errors: [
            {
              messageId: "undeclaredToken",
              data: {
                className: "bg-highlight",
                tokens: "accent, accent-ink, ink, ink-muted, line, paper",
                file: "test/fixtures/no-json/src/styles.css",
              },
            },
          ],
        },
        {
          filename: WEB_PAGE,
          code: template(`<div class="bg-highlight" />`),
          errors: [
            {
              messageId: "undeclaredToken",
              data: {
                className: "bg-highlight",
                tokens:
                  "background, brand, foreground, primary, primary-foreground",
                file: "test/fixtures/monorepo/apps/web/app/globals.css",
              },
            },
          ],
        },
      ],
    })
  })
})

describe("ignoreImports", () => {
  test("a same-named third-party component is left alone when its source is ignored", () => {
    const code = sfc(
      `import { Button } from "@mui/material"`,
      `<Button class="bg-red-500">Go</Button>`
    )
    tester.run("no-restyle", boundary, {
      valid: [
        {
          filename: PAGE,
          code,
          options: [{ ignoreImports: ["^@mui/"] }],
        },
      ],
      invalid: [
        {
          filename: PAGE,
          code,
          errors: [{ messageId: "appearanceClassWithVariants" }],
        },
      ],
    })
  })
})

describe("helpers", () => {
  test("mergeFunctions adds to the defaults; cx is a default", () => {
    tester.run("require-static-classes", requireStaticClasses as any, {
      valid: [
        {
          filename: PAGE,
          code: sfc(
            `${button}\nimport { cx } from "class-variance-authority"`,
            `<Button :class="cx('w-full')">Go</Button>`
          ),
        },
        {
          filename: PAGE,
          code: sfc(
            `${button}\nimport { merge } from "./merge"\nimport { cn } from "@/lib/utils"`,
            `<Button :class="merge(cn('w-full'))">Go</Button>`
          ),
          options: [{ mergeFunctions: ["merge"] }],
        },
      ],
      invalid: [
        {
          filename: PAGE,
          code: sfc(
            `${button}\nimport { merge } from "./merge"`,
            `<Button :class="merge('w-full')">Go</Button>`
          ),
          errors: [{ messageId: "dynamicClasses" }],
        },
      ],
    })
  })

  test("variantFunctions reads object values like cva", () => {
    const code = `import { defineVariants } from "./variants"\nconst tone = defineVariants({ variants: { tone: { pink: "bg-pink-500" } } })`
    tester.run("no-raw-colors", noRawColors as any, {
      valid: [{ filename: PAGE, code: sfc(code, "<div />") }],
      invalid: [
        {
          filename: PAGE,
          code: sfc(code, "<div />"),
          options: [{ variantFunctions: ["defineVariants"] }],
          errors: [{ messageId: "paletteClassFar" }],
        },
      ],
    })
  })
})
