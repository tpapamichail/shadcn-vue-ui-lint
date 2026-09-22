import { describe, test } from "vitest"

import { plugin } from "../src/index"
import { noRestyle } from "../src/rules/no-restyle"
import { noUnknownClasses } from "../src/rules/no-unknown-classes"
import { requireStaticClasses } from "../src/rules/require-static-classes"
import { button, cn, createTester, PAGE, sfc } from "./helpers"

const tester = createTester()

const boundary = noRestyle as any

const appearance = () => ({ messageId: "appearanceClassWithVariants" })

// Layout may cross: these cases are about the shapes a value arrives in,
// and only the appearance class in each is meant to be reported.
const options = [{ allow: ["layout"] }]

describe("ordinary prop shapes reach the rules", () => {
  test("spreads, alternatives, class objects, member access", () => {
    tester.run("no-restyle", boundary, {
      valid: [
        {
          filename: PAGE,
          options,
          code: sfc(
            `${button}\nconst props = { class: "mt-4 w-full" }`,
            `<Button v-bind="props" />`
          ),
        },
        // Both branches read the same resolved variable.
        {
          filename: PAGE,
          options,
          code: sfc(
            `${button}\nconst base = "mt-4"\nconst on = true`,
            `<Button :class="on ? base : base">Go</Button>`
          ),
        },
      ],
      invalid: [
        // An object literal spread onto the element.
        {
          filename: PAGE,
          options,
          code: sfc(button, `<Button v-bind="{ class: 'bg-red-500 mt-4' }" />`),
          errors: [appearance()],
        },
        // A same-file object's class behind a spread.
        {
          filename: PAGE,
          options,
          code: sfc(
            `${button}\nconst props = { class: "rounded-full" }`,
            `<Button v-bind="{ class: props.class }" />`
          ),
          errors: [appearance()],
        },
        // Both sides of || and ?? render.
        {
          filename: PAGE,
          options,
          code: sfc(
            `${button}\nconst classes = "bg-red-500"`,
            `<Button :class="classes || 'w-full'">Go</Button>`
          ),
          errors: [appearance()],
        },
        {
          filename: PAGE,
          options,
          code: sfc(
            `${button}\nconst classes = "bg-red-500"`,
            `<Button :class="classes ?? 'w-full'">Go</Button>`
          ),
          errors: [appearance()],
        },
        // Identifier keys of a clsx object are classes.
        {
          filename: PAGE,
          options,
          code: sfc(
            `${button}\n${cn}`,
            `<Button :class="cn({ rounded: true, italic: true, flex: true })">Go</Button>`
          ),
          errors: [appearance(), appearance()],
        },
        // theme.class through a same-file object.
        {
          filename: PAGE,
          options,
          code: sfc(
            `${button}\nconst theme = { className: "bg-red-500" }`,
            `<Button :class="theme.className">Go</Button>`
          ),
          errors: [appearance()],
        },
        // A class object behind a variable is read by its values.
        {
          filename: PAGE,
          options,
          code: sfc(
            `${button}\nconst classes = { root: "bg-red-500" }`,
            `<Button v-bind="{ class: classes }">Go</Button>`
          ),
          errors: [appearance()],
        },
      ],
    })
  })

  test("template interpolation does not leave half a class behind", () => {
    tester.run("require-static-classes", requireStaticClasses as any, {
      valid: [],
      invalid: [
        {
          filename: PAGE,
          code: sfc(
            `${button}\nconst n = 8`,
            `<Button :class="\`mt-\${n} w-full\`">Go</Button>`
          ),
          errors: [{ messageId: "dynamicClasses" }],
        },
      ],
    })
    // The partial "mt-" is not judged as a class by the other rules.
    tester.run(
      "no-unknown-classes",
      plugin.rules["no-unknown-classes"] as any,
      {
        valid: [
          {
            filename: PAGE,
            code: sfc(
              `const n = 8`,
              `<div :class="\`mt-\${n} w-full\`" />`
            ),
          },
        ],
        invalid: [],
      }
    )
  })

  test("a forwarded class is recognized by its binding", () => {
    tester.run("require-static-classes", requireStaticClasses as any, {
      valid: [
        {
          filename: PAGE,
          code: sfc(
            `${button}\nconst { class: cls } = defineProps<{ class?: string }>()`,
            `<Button :class="cls">Save</Button>`
          ),
        },
        {
          filename: PAGE,
          code: sfc(
            `${button}\nconst props = defineProps<{ class?: string }>()`,
            `<Button :class="props.class">Save</Button>`
          ),
        },
      ],
      invalid: [
        // Another prop is not the forwarded class.
        {
          filename: PAGE,
          code: sfc(
            `${button}\nconst { tone } = defineProps<{ tone?: string }>()`,
            `<Button :class="tone">Save</Button>`
          ),
          errors: [{ messageId: "dynamicClasses" }],
        },
      ],
    })
  })
})

describe("variant helper configs", () => {
  test("tv settings keys are not class strings", () => {
    tester.run("no-unknown-classes", noUnknownClasses as any, {
      valid: [
        {
          filename: PAGE,
          code: sfc(
            `import { tv } from "tailwind-variants"\nconst box = tv({ base: "flex", variants: { size: { sm: "p-2" } }, responsiveVariants: ["sm", "md"], defaultVariants: { size: "sm" } })`,
            `<div />`
          ),
        },
      ],
      invalid: [],
    })
  })
})
