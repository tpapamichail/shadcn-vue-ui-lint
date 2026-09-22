import { describe, expect, test } from "vitest"

import {
  noArbitraryValues,
  scaleEquivalent,
} from "../src/rules/no-arbitrary-values"
import {
  button,
  cn,
  createTester,
  OUTSIDE,
  PAGE,
  sfc,
  template,
} from "./helpers"

const tester = createTester()
const rule = noArbitraryValues as any

describe("scaleEquivalent", () => {
  test.each([
    ["p-[13px]", "p-3.25"],
    ["md:px-[16px]", "md:px-4"],
    ["-mt-[8px]", "-mt-2"],
    ["p-[13.5px]", null],
    ["text-[13px]", "text-3.25"],
    // Two-segment utility names are on the scale too.
    ["border-spacing-x-[8px]", "border-spacing-x-2"],
    ["scroll-mt-[4px]", "scroll-mt-1"],
  ])("%s -> %s", (token, expected) => {
    expect(scaleEquivalent(token)).toBe(expected)
  })
})

describe("no-arbitrary-values", () => {
  test("rule", () => {
    tester.run("no-arbitrary-values", rule, {
      valid: [
        {
          filename: PAGE,
          code: template(
            `<div class="p-4 rounded-lg border border-border text-sm bg-card" />`
          ),
        },
        {
          filename: PAGE,
          code: template(
            `<div class="data-[state=open]:flex [&_svg]:size-4" />`
          ),
        },
        // Geometry is contextual, so a project opens layout and keeps
        // the rule on appearance.
        {
          filename: PAGE,
          code: template(
            `<div class="w-[calc(100%-2rem)] max-h-[250px] mt-[13px]" />`
          ),
          options: [{ allow: ["layout"] }],
        },
        {
          filename: PAGE,
          code: template(`<div class="w-[320px]" />`),
          options: [{ allow: ["w-[320px]"] }],
        },
      ],
      invalid: [
        {
          filename: PAGE,
          code: template(
            `<div class="p-[13px] rounded-[10px] border-[#E4E4E7] text-[13px]" />`
          ),
          errors: [
            {
              messageId: "arbitraryValueWithScale",
              data: { className: "p-[13px]", replacement: "p-3.25" },
              suggestions: [
                {
                  messageId: "useScale",
                  data: { replacement: "p-3.25" },
                  output: template(
                    `<div class="p-3.25 rounded-[10px] border-[#E4E4E7] text-[13px]" />`
                  ),
                },
              ],
            },
            // The fixture theme sets --radius-lg to var(--radius), 10px.
            {
              messageId: "arbitraryValueWithScale",
              data: { className: "rounded-[10px]", replacement: "rounded-lg" },
              suggestions: [
                {
                  messageId: "useScale",
                  data: { replacement: "rounded-lg" },
                  output: template(
                    `<div class="p-[13px] rounded-lg border-[#E4E4E7] text-[13px]" />`
                  ),
                },
              ],
            },
            {
              messageId: "arbitraryColorNear",
              data: {
                className: "border-[#E4E4E7]",
                suggestions: "border-border, border-muted",
                file: "test/fixtures/project/app/globals.css",
              },
              suggestions: [
                {
                  messageId: "useToken",
                  data: { replacement: "border-border" },
                  output: template(
                    `<div class="p-[13px] rounded-[10px] border-border text-[13px]" />`
                  ),
                },
                {
                  messageId: "useToken",
                  data: { replacement: "border-muted" },
                  output: template(
                    `<div class="p-[13px] rounded-[10px] border-muted text-[13px]" />`
                  ),
                },
              ],
            },
            {
              messageId: "arbitraryValueNearScale",
              data: {
                className: "text-[13px]",
                suggestions: "text-xs (12px), text-sm (14px)",
              },
            },
          ],
        },
        {
          filename: PAGE,
          code: sfc(button, `<Button class="p-[3px]">Go</Button>`),
          errors: [
            {
              messageId: "arbitraryValueWithScale",
              suggestions: [
                {
                  messageId: "useScale",
                  data: { replacement: "p-0.75" },
                  output: sfc(button, `<Button class="p-0.75">Go</Button>`),
                },
              ],
            },
          ],
        },
        {
          filename: PAGE,
          code: sfc(cn, `<p :class="cn('md:text-[11px]')" />`),
          errors: [
            {
              messageId: "arbitraryValueNearScale",
              data: {
                className: "md:text-[11px]",
                suggestions: "md:text-xs (12px), md:text-sm (14px)",
              },
            },
          ],
        },
        // A layout value is a value like any other until layout is allowed.
        {
          filename: PAGE,
          code: template(`<div class="w-[320px] mt-[13px]" />`),
          errors: [
            {
              messageId: "arbitraryValueWithScale",
              data: { className: "w-[320px]", replacement: "w-80" },
              suggestions: [
                {
                  messageId: "useScale",
                  data: { replacement: "w-80" },
                  output: template(`<div class="w-80 mt-[13px]" />`),
                },
              ],
            },
            {
              messageId: "arbitraryValueWithScale",
              data: { className: "mt-[13px]", replacement: "mt-3.25" },
              suggestions: [
                {
                  messageId: "useScale",
                  data: { replacement: "mt-3.25" },
                  output: template(`<div class="w-[320px] mt-3.25" />`),
                },
              ],
            },
          ],
        },
        // A helper call in the script is a site of its own; a template
        // binding to a same-file constant is one hop.
        {
          filename: PAGE,
          code: sfc(
            `import { cva } from "class-variance-authority"\nconst v = cva("bg-[#f0f]")`,
            ""
          ),
          errors: [{ messageId: "arbitraryColorFar" }],
        },
        {
          filename: PAGE,
          code: sfc(`const c = "bg-[#ff00aa]"`, `<div :class="c" />`),
          errors: [
            {
              messageId: "arbitraryColorFar",
              data: {
                className: "bg-[#ff00aa]",
                suggestions: "",
                tokens:
                  "accent, background, border, card, destructive, foreground, input, muted, popover, primary, ring, secondary (+6 more)",
                file: "test/fixtures/project/app/globals.css",
              },
            },
          ],
        },
        // Outside any project: no theme, no scale beyond the defaults.
        {
          filename: OUTSIDE,
          code: template(
            `<div class="bg-[#ff00aa] rounded-[10px] text-[0.875rem]" />`
          ),
          errors: [
            {
              messageId: "arbitraryValue",
              data: { className: "bg-[#ff00aa]" },
            },
            {
              messageId: "arbitraryValueNearScale",
              data: {
                className: "rounded-[10px]",
                suggestions: "rounded-lg (8px), rounded-xl (12px)",
              },
            },
            {
              messageId: "arbitraryValueWithScale",
              data: { className: "text-[0.875rem]", replacement: "text-sm" },
              suggestions: [
                {
                  messageId: "useScale",
                  data: { replacement: "text-sm" },
                  output: template(
                    `<div class="bg-[#ff00aa] rounded-[10px] text-sm" />`
                  ),
                },
              ],
            },
          ],
        },
      ],
    })
  })
})

test("a two-segment spacing utility gets its scale replacement", () => {
  const code = template(`<div class="border-spacing-x-[8px]" />`)
  createTester().run("no-arbitrary-values", noArbitraryValues as any, {
    valid: [],
    invalid: [
      {
        filename: PAGE,
        code,
        errors: [
          {
            messageId: "arbitraryValueWithScale",
            data: {
              className: "border-spacing-x-[8px]",
              replacement: "border-spacing-x-2",
            },
            suggestions: [
              {
                messageId: "useScale",
                data: { replacement: "border-spacing-x-2" },
                output: code.replace(
                  "border-spacing-x-[8px]",
                  "border-spacing-x-2"
                ),
              },
            ],
          },
        ],
      },
    ],
  })
})

// An arbitrary layout property is reported until layout is allowed;
// docs/rules.md points contracts at this for [margin:1rem].
test("an arbitrary layout property follows the layout keyword", () => {
  const code = template(`<div class="[margin:1rem]" />`)
  createTester().run("no-arbitrary-values", noArbitraryValues as any, {
    valid: [{ filename: PAGE, code, options: [{ allow: ["layout"] }] }],
    invalid: [
      {
        filename: PAGE,
        code,
        errors: [{ message: /"\[margin:1rem\]" hardcodes an off-token value/ }],
      },
    ],
  })
})
