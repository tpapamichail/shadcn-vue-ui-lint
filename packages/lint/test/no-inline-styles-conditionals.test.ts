// The common conditional idioms around a style object are not dynamic
// styles: each object branch is judged on its own, and undefined or
// null is nothing to judge.

import { describe, test } from "vitest"

import { noInlineStyles } from "../src/rules/no-inline-styles"
import { createTester, sfc, template } from "./helpers"

describe("no-inline-styles reads conditional style values", () => {
  test("branches are judged, undefined and null are nothing", () => {
    createTester().run("no-inline-styles", noInlineStyles as any, {
      valid: [
        {
          code: sfc(
            `const open = true`,
            `<div :style="open ? { '--x': '1' } : undefined" />`
          ),
        },
        {
          code: sfc(
            `const open = true`,
            `<div :style="open && { '--x': '1' }" />`
          ),
        },
        {
          code: sfc(
            `const open = true`,
            `<div :style="open ? { '--x': '1' } : { '--x': '0' }" />`
          ),
        },
        // Both sides of ?? and || are values: the forwarded prop and a
        // default object.
        {
          code: sfc(
            `const { style } = defineProps<{ style?: object }>()`,
            `<div :style="style ?? { '--x': '1' }" />`
          ),
        },
        {
          code: sfc(
            `const base = { "--x": "1" }\nconst { style } = defineProps<{ style?: object }>()`,
            `<div :style="style || base" />`
          ),
        },
        { code: template(`<div :style="undefined" />`) },
        { code: template(`<div :style="null" />`) },
        {
          code: sfc(
            `const open = true`,
            `<div :style="(open ? { '--x': '1' } : undefined) as Record<string, string>" />`
          ),
        },
      ],
      invalid: [
        // A branch that carries a raw color is still that finding.
        {
          code: sfc(
            `const open = true`,
            `<div :style="open ? { '--glow': '#ff00aa' } : undefined" />`
          ),
          errors: [{ messageId: "customPropColor" }],
        },
        {
          code: sfc(
            `const open = true`,
            `<div :style="open && { '--glow': 'rgb(0 0 0)' }" />`
          ),
          errors: [{ messageId: "customPropColor" }],
        },
        // A branch that sets a property is an inline style.
        {
          code: sfc(
            `const open = true`,
            `<div :style="open ? { color: 'red' } : { '--x': '1' }" />`
          ),
          errors: [{ messageId: "inlineStyle", data: { property: "color" } }],
        },
        // A branch that is opaque is still dynamic; the other is not.
        {
          code: sfc(
            `const open = true\nconst props = defineProps<{ s?: object }>()`,
            `<div :style="open ? props.s : { '--x': '1' }" />`
          ),
          errors: [{ messageId: "dynamicStyle" }],
        },
      ],
    })
  })
})
