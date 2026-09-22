import { describe, test } from "vitest"

import { noInlineStyles } from "../src/rules/no-inline-styles"
import { createTester, PAGE, sfc, template } from "./helpers"

const tester = createTester()

describe("no-inline-styles", () => {
  test("rule", () => {
    tester.run("no-inline-styles", noInlineStyles as any, {
      valid: [
        { code: template(`<div class="p-4" />`) },
        {
          code: sfc(
            `const props = defineProps<{ w?: string }>()`,
            `<div :style="{ '--sidebar-width': props.w }" />`
          ),
        },
        { code: template(`<div :style="{ '--gap': '8px' }" />`) },
        // A forwarded style prop: the received part stays opaque while
        // the local custom property beside it is readable.
        {
          code: sfc(
            `const props = defineProps<{ style?: object }>()`,
            `<div :style="{ '--w': 4, ...props.style }" />`
          ),
        },
        // A custom property fed from a token, one hop away.
        {
          code: sfc(
            `const tones = { brand: "var(--color-brand)", muted: "var(--color-muted)" }\nconst tone = "brand"`,
            `<div :style="{ '--ring': tones[tone] }" />`
          ),
        },
      ],
      invalid: [
        // A contract's own words reach a style the collector cannot
        // read, the same as they reach a property finding.
        {
          code: sfc(
            `const { style = buildStyle() } = defineProps<{ style?: object }>()`,
            `<Box :style="style" />`
          ),
          options: [
            {
              contracts: [
                {
                  pattern: "^Box$",
                  message: "<Box> takes its style from the theme.",
                },
              ],
            },
          ],
          errors: [{ message: "<Box> takes its style from the theme." }],
        },
        // A raw color laundered through a variable into a custom property.
        {
          code: sfc(
            `const glow = "rgba(59, 130, 246, 0.15)"`,
            `<div :style="{ '--glow': glow }" />`
          ),
          errors: [{ messageId: "customPropColor" }],
        },
        // ...or through a lookup table.
        {
          code: sfc(
            `const glowColorMap = { blue: "rgba(59, 130, 246, 0.15)", slate: "rgba(148, 163, 184, 0.15)" }\nconst tone = "blue"\nconst c = glowColorMap[tone]`,
            `<div :style="{ '--glow-shadow-color': c }" />`
          ),
          errors: [{ messageId: "customPropColor" }],
        },
        {
          code: template(
            `<div :style="{ backgroundColor: '#FF6B35', padding: 13 }" />`
          ),
          errors: [{ messageId: "inlineStyle" }, { messageId: "inlineStyle" }],
        },
        {
          code: sfc(
            `const props = defineProps<{ w?: string }>()`,
            `<div :style="{ '--w': props.w, color: 'red' }" />`
          ),
          errors: [{ messageId: "inlineStyle" }],
        },
        {
          code: template(`<div class="bg-(--x)" :style="{ '--x': '#ff00aa' }" />`),
          errors: [{ messageId: "customPropColor" }],
        },
        {
          code: template(`<div :style="{ '--tint': 'oklch(0.6 0.2 20)' }" />`),
          errors: [{ messageId: "customPropColor" }],
        },
        {
          code: sfc(
            `const props = defineProps<{ s?: object }>()`,
            `<div :style="props.s" />`
          ),
          errors: [{ messageId: "dynamicStyle" }],
        },
        {
          code: sfc(
            `const props = defineProps<{ s?: object }>()`,
            `<div :style="{ ...props.s }" />`
          ),
          errors: [{ messageId: "dynamicStyle" }],
        },
      ],
    })
  })
})

describe("inline custom properties", () => {
  test("named colors and hwb() are raw colors too", () => {
    tester.run("no-inline-styles", noInlineStyles as any, {
      valid: [
        {
          filename: PAGE,
          code: template(`<div :style="{ '--bg': 'var(--color-primary)' }" />`),
        },
      ],
      invalid: [
        {
          filename: PAGE,
          code: template(`<div :style="{ '--bg': 'red' }" />`),
          errors: [{ messageId: "customPropColor" }],
        },
        {
          filename: PAGE,
          code: template(`<div :style="{ '--bg': 'hwb(0 0% 0%)' }" />`),
          errors: [{ messageId: "customPropColor" }],
        },
        // A style object spread onto the element.
        {
          filename: PAGE,
          code: template(`<div v-bind="{ style: { color: 'red' } }" />`),
          errors: [{ messageId: "inlineStyle" }],
        },
      ],
    })
  })
})

describe("no-inline-styles resolves local style objects", () => {
  test("a local object named style is judged, a received prop is not", () => {
    tester.run("no-inline-styles", noInlineStyles as any, {
      valid: [
        {
          code: sfc(
            `const { style } = defineProps<{ style?: object }>()`,
            `<div :style="style" />`
          ),
        },
        {
          code: sfc(
            `const style = { "--gap": "8px" }`,
            `<div :style="style" />`
          ),
        },
        {
          code: sfc(
            `const theme = { style: { "--gap": "8px" } }`,
            `<div :style="theme.style" />`
          ),
        },
      ],
      invalid: [
        {
          code: sfc(
            `const style = { color: "#ff0000" }`,
            `<div :style="style" />`
          ),
          errors: [{ messageId: "inlineStyle" }],
        },
        {
          code: sfc(
            `const theme = { style: { backgroundColor: "red" } }`,
            `<div :style="theme.style" />`
          ),
          errors: [{ messageId: "inlineStyle" }],
        },
        {
          code: sfc(
            `const base = { padding: 4 }`,
            `<div :style="{ '--x': 1, ...base }" />`
          ),
          errors: [{ messageId: "inlineStyle" }],
        },
      ],
    })
  })
})

describe("colors in templates and gradient stops", () => {
  test("named colors are found wherever they stand alone", () => {
    tester.run("no-inline-styles", noInlineStyles as any, {
      valid: [
        {
          filename: PAGE,
          code: template(`<div :style="{ '--icon': 'url(orange-icon.svg)' }" />`),
        },
        {
          filename: PAGE,
          code: template(`<div :style="{ '--paint': \`var(--color-primary)\` }" />`),
        },
      ],
      invalid: [
        {
          filename: PAGE,
          code: template(`<div :style="{ '--paint': \`rebeccapurple\` }" />`),
          errors: [{ messageId: "customPropColor" }],
        },
        {
          filename: PAGE,
          code: template(
            `<div :style="{ '--paint': 'linear-gradient(red, blue)' }" />`
          ),
          errors: [{ messageId: "customPropColor" }],
        },
      ],
    })
  })
})

describe("allow", () => {
  test("an allowed property is not judged; the rest still are", () => {
    tester.run("no-inline-styles", noInlineStyles as any, {
      valid: [
        {
          code: sfc(
            `const x = 8`,
            `<div :style="{ transform: \`translateX(\${x}px)\` }" />`
          ),
          options: [{ allow: ["transform"] }],
        },
        // Either spelling names the property, and a glob covers a family.
        {
          code: template(`<div :style="{ backgroundColor: 'violet' }" />`),
          options: [{ allow: ["background-color"] }],
        },
        {
          code: template(
            `<div :style="{ borderColor: 'red', borderWidth: 2 }" />`
          ),
          options: [{ allow: ["border-*"] }],
        },
      ],
      invalid: [
        {
          code: template(
            `<div :style="{ backgroundColor: 'violet', color: 'blue' }" />`
          ),
          options: [{ allow: ["backgroundColor"] }],
          errors: [{ messageId: "inlineStyle", data: { property: "color" } }],
        },
        // A class is not a property name. The mistake is reported on line 1.
        {
          code: template(`<div class="p-4" />`),
          options: [{ allow: ["bg-red-500"] }],
          errors: [
            { message: /entry "bg-red-500" is not a CSS property name/ },
          ],
        },
      ],
    })
  })
})

describe("static style attributes", () => {
  test("each declaration is judged on its own", () => {
    tester.run("no-inline-styles", noInlineStyles as any, {
      valid: [
        // A property the policy allows stays out of it.
        {
          code: template(`<div style="transform: translateX(4px)" />`),
          options: [{ allow: ["transform"] }],
        },
      ],
      invalid: [
        {
          code: template(`<div style="color: red; padding: 4px" />`),
          errors: [
            { messageId: "inlineStyle", data: { property: "color" } },
            { messageId: "inlineStyle", data: { property: "padding" } },
          ],
        },
        // A custom property holding a raw color is that finding too.
        {
          code: template(`<div style="--tint: #ff00aa" />`),
          errors: [
            { messageId: "customPropColor", data: { property: "--tint" } },
          ],
        },
      ],
    })
  })
})