// A destructured binding reads one slot of its initializer. Reading the
// whole initializer reported a sibling label as a class and an object's
// keys instead of the destructured value.

import { describe, test } from "vitest"

import { noArbitraryValues } from "../src/rules/no-arbitrary-values"
import { noUnknownClasses } from "../src/rules/no-unknown-classes"
import { oracleAvailable } from "../src/tailwind/client"
import { createTester, PAGE, sfc } from "./helpers"

const tester = createTester()

// With the worker built the project's Tailwind names the fix; without
// it the bundled grammar only knows the class is unknown.
const unknown = (code: string, className: string, suggestion: string) =>
  oracleAvailable()
    ? {
        messageId: "unknownClassSuggest",
        data: {
          className,
          suggestion,
          file: "test/fixtures/project/app/globals.css",
        },
        suggestions: [
          {
            messageId: "useSuggestion",
            data: { suggestion },
            output: code.replace(className, suggestion),
          },
        ],
      }
    : {
        messageId: "unknownClass",
        data: {
          className,
          suggestion: "",
          file: "test/fixtures/project/app/globals.css",
        },
      }

const ARRAY_TYPO = sfc(
  `const ok = true
const [dot, text, cls] = ok ? ["var(--ok)", "Connected", "itms-center"] : ["var(--muted)", "Needs setup", "items-start"]`,
  `<span :class="cls">{{ text }}</span>`
)

const OBJECT_TYPO = sfc(
  `const ok = true
const { Icon, colorCls } = ok ? { Icon: "x", colorCls: "flex" } : { Icon: "y", colorCls: "flx" }`,
  `<span :class="colorCls" :title="Icon" />`
)

const ARBITRARY = sfc(
  `const ok = true
const [dot, label, cls] = ok ? ["var(--ok)", "Connected", "p-[13px]"] : ["var(--muted)", "Needs setup", "p-4"]`,
  `<span :class="cls">{{ label }}</span>`
)

describe("destructured initializers", () => {
  test("only the destructured slot reaches the class site", () => {
    tester.run("no-unknown-classes", noUnknownClasses as any, {
      valid: [
        // The reporter's case: the array's other slots are a variable
        // reference and a label, and the object's keys are not classes.
        {
          filename: PAGE,
          code: sfc(
            `const ok = true
const [dot, text, cls] = ok ? ["var(--ok)", "Connected", "items-center"] : ["var(--muted)", "Needs setup", "items-start"]
const { Icon, colorCls } = ok ? { Icon: "x", colorCls: "flex" } : { Icon: "y", colorCls: "grid" }`,
            `<span :class="\`flex \${cls} \${colorCls}\`" :style="{ background: dot }" :title="Icon">{{ text }}</span>`
          ),
        },
        // Through another binding, and a plain literal.
        {
          filename: PAGE,
          code: sfc(
            `const pair = ["Label", "flex"]
const [, , cls] = ["a", "b", "grid"]
const [label, klass] = pair`,
            `<span :class="\`\${klass} \${cls}\`">{{ label }}</span>`
          ),
        },
      ],
      invalid: [
        // The slot itself is still read: one finding, for the typo.
        {
          filename: PAGE,
          code: ARRAY_TYPO,
          errors: [unknown(ARRAY_TYPO, "itms-center", "items-center")],
        },
        {
          filename: PAGE,
          code: OBJECT_TYPO,
          errors: [unknown(OBJECT_TYPO, "flx", "flex")],
        },
      ],
    })
  })

  test("a slot that cannot be read is not read as its siblings", () => {
    tester.run("no-arbitrary-values", noArbitraryValues as any, {
      valid: [
        // A rest holds several slots; a spread moves them: neither is
        // read, and the siblings are not read in their place.
        {
          filename: PAGE,
          code: sfc(
            `const more: string[] = []
const [label, ...rest] = ["p-[13px]", "flex"]
const [first, second] = [...more, "p-[13px]"]`,
            `<span :class="\`\${rest[0]} \${second}\`">{{ label }}</span>`
          ),
        },
      ],
      invalid: [
        {
          filename: PAGE,
          code: ARBITRARY,
          errors: [
            {
              messageId: "arbitraryValueWithScale",
              data: { className: "p-[13px]", replacement: "p-3.25" },
              suggestions: [
                {
                  messageId: "useScale",
                  data: { replacement: "p-3.25" },
                  output: ARBITRARY.replace("p-[13px]", "p-3.25"),
                },
              ],
            },
          ],
        },
      ],
    })
  })
})
