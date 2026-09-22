import tsParser from "@typescript-eslint/parser"
import { Linter } from "eslint"
import { describe, expect, test } from "vitest"
import vueParser from "vue-eslint-parser"

import { plugin } from "../src/index"
import { sfc, template } from "./helpers"

function messages(code: string) {
  const linter = new Linter()
  return linter
    .verify(
      code,
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
        rules: { "shadcn-vue/no-inline-styles": "error" },
      },
      { filename: "page.vue" }
    )
    .map((message) => message.messageId ?? message.message)
}

describe("final inline-style properties", () => {
  test.each([
    {
      name: "a local style binding is checked",
      code: sfc(`const style = { color: "red" }`, `<div :style="style" />`),
      expected: ["inlineStyle"],
    },
    {
      name: "ordinary custom properties in a local object remain readable",
      code: sfc(
        `const spacing = { "--gap": "4px" }`,
        `<div :style="spacing" />`
      ),
      expected: [],
    },
    {
      name: "a mutated local style binding is uncertain",
      code: sfc(
        `const style = { "--gap": "4px" }\nstyle.color = "red"`,
        `<div :style="style" />`
      ),
      expected: ["dynamicStyle"],
    },
    {
      name: "an escaped style member is uncertain",
      code: sfc(
        `const theme = { style: { "--gap": "4px" } }\nconst alias = theme\nalias.style = { color: "red" }`,
        `<div :style="theme.style" />`
      ),
      expected: ["dynamicStyle"],
    },
    {
      name: "a style member passed to an opaque owner is uncertain",
      code: sfc(
        `const theme = { style: { "--gap": "4px" } }\nmutate(theme)`,
        `<div :style="theme.style" />`
      ),
      expected: ["dynamicStyle"],
    },
    {
      name: "a received style under a local alias stays forwardable",
      code: sfc(
        `const { style: inherited } = defineProps<{ style?: object }>()`,
        `<div :style="inherited" />`
      ),
      expected: [],
    },
    {
      name: "a computed received style stays forwardable",
      code: sfc(
        `const props = defineProps<{ style?: object }>()`,
        `<div :style="props[\`style\`]" />`
      ),
      expected: [],
    },
    {
      name: "a written received style loses forwarding",
      code: sfc(
        `const props = defineProps<{ style?: object }>()\nlet style = props.style\nstyle = { color: "red" }`,
        `<div :style="style" />`
      ),
      expected: ["dynamicStyle"],
    },
    // Dropped: writing `props.style`. The props are readonly in Vue,
    // and a received prop stays opaque to this file either way.
    {
      name: "a received style default is checked",
      code: sfc(
        `const { style = { color: "red" } } = defineProps<{ style?: object }>()`,
        `<div :style="style" />`
      ),
      expected: ["inlineStyle"],
    },
    {
      name: "a received style default under an alias is checked",
      code: sfc(
        `const { style: inherited = { color: "red" } } = defineProps<{ style?: object }>()`,
        `<div :style="inherited" />`
      ),
      expected: ["inlineStyle"],
    },
    {
      name: "a custom-property style default stays clean",
      code: sfc(
        `const { style = { "--gap": "4px" } } = defineProps<{ style?: object }>()`,
        `<div :style="style" />`
      ),
      expected: [],
    },
    {
      name: "a raw default is checked when the received style is spread",
      code: sfc(
        `const { style = { color: "red" } } = defineProps<{ style?: object }>()`,
        `<div :style="{ '--gap': '4px', ...style }" />`
      ),
      expected: ["inlineStyle"],
    },
    {
      name: "a default props object's style is checked",
      code: sfc(
        `const props = withDefaults(defineProps<{ style?: object }>(), { style: { color: "red" } })`,
        `<div :style="props.style" />`
      ),
      expected: ["inlineStyle"],
    },
    {
      name: "a runtime props default is checked",
      code: sfc(
        `const props = defineProps({ style: { default: { color: "red" } } })`,
        `<div :style="props.style" />`
      ),
      expected: ["inlineStyle"],
    },
    {
      name: "a custom-property style in default props stays clean",
      code: sfc(
        `const props = withDefaults(defineProps<{ style?: object }>(), { style: { "--gap": "4px" } })`,
        `<div :style="props.style" />`
      ),
      expected: [],
    },
    {
      name: "an unreadable style default is uncertain",
      code: sfc(
        `const { style = buildStyle() } = defineProps<{ style?: object }>()`,
        `<div :style="style" />`
      ),
      expected: ["dynamicStyle"],
    },
    {
      name: "an unreadable default props object is uncertain",
      code: sfc(
        `const props = withDefaults(defineProps<{ style?: object }>(), { style: buildStyle() })`,
        `<div :style="props.style" />`
      ),
      expected: ["dynamicStyle"],
    },
    {
      name: "nested literal props",
      code: template(`<div v-bind="{ ...{ style: { color: 'red' } } }" />`),
      expected: ["inlineStyle"],
    },
    {
      name: "nested same-file props",
      code: sfc(
        `const props = { style: { color: "red" } }\nconst combined = { ...props }`,
        `<div v-bind="combined" />`
      ),
      expected: ["inlineStyle"],
    },
    {
      name: "a member reads the final style through nested props",
      code: sfc(
        `const theme = { style: { color: "red" }, ...{ style: { "--gap": "4px" } } }`,
        `<div :style="theme.style" />`
      ),
      expected: [],
    },
    {
      name: "a computed member reads nested style props",
      code: sfc(
        `const theme = { ...{ style: { color: "red" } } }`,
        `<div :style="theme[\`style\`]" />`
      ),
      expected: ["inlineStyle"],
    },
    {
      name: "computed template style key",
      code: template(`<div v-bind="{ [\`style\`]: { color: 'red' } }" />`),
      expected: ["inlineStyle"],
    },
    {
      name: "safe style overwrites a nested violation",
      code: template(
        `<div v-bind="{ ...{ style: { color: 'red' } }, style: { '--gap': '4px' } }" />`
      ),
      expected: [],
    },
    {
      name: "nested safe style overwrites a direct violation",
      code: template(
        `<div v-bind="{ style: { color: 'red' }, ...{ style: { '--gap': '4px' } } }" />`
      ),
      expected: [],
    },
    {
      name: "nested violation overwrites safe style",
      code: template(
        `<div v-bind="{ style: { '--gap': '4px' }, ...{ style: { color: 'red' } } }" />`
      ),
      expected: ["inlineStyle"],
    },
    {
      name: "duplicate direct style uses its final value",
      code: template(
        `<div v-bind="{ style: { color: 'red' }, style: { '--gap': '4px' } }" />`
      ),
      expected: [],
    },
    {
      name: "opaque whole-prop spread remains exempt",
      code: sfc(
        `const props = defineProps<{ style?: object }>()`,
        `<div v-bind="props" />`
      ),
      expected: [],
    },
    {
      name: "nested opaque whole-prop spread remains exempt",
      code: sfc(
        `const props = defineProps<{ style?: object }>()`,
        `<div v-bind="{ ...props }" />`
      ),
      expected: [],
    },
    {
      name: "unknown overwrite of a known style is dynamic",
      code: sfc(
        `const props = defineProps<{ style?: object }>()`,
        `<div v-bind="{ style: { '--gap': '4px' }, ...props }" />`
      ),
      expected: ["dynamicStyle"],
    },
    {
      name: "a final known style after opaque props is checked",
      code: sfc(
        `const props = defineProps<{ style?: object }>()`,
        `<div v-bind="{ ...props, style: { color: 'red' } }" />`
      ),
      expected: ["inlineStyle"],
    },
    {
      name: "nested safe style value",
      code: template(`<div :style="{ ...{ '--gap': '4px' } }" />`),
      expected: [],
    },
    {
      name: "nested forbidden style value",
      code: template(`<div :style="{ ...{ color: 'red' } }" />`),
      expected: ["inlineStyle"],
    },
    {
      name: "computed template custom property",
      code: template(`<div :style="{ [\`--gap\`]: '4px' }" />`),
      expected: [],
    },
    {
      name: "a token overwrites a raw custom-property color",
      code: template(
        `<div :style="{ '--tint': 'red', ...{ '--tint': 'var(--color-primary)' } }" />`
      ),
      expected: [],
    },
    {
      name: "a raw color overwrites a token",
      code: template(
        `<div :style="{ '--tint': 'var(--color-primary)', ...{ '--tint': 'red' } }" />`
      ),
      expected: ["customPropColor"],
    },
    {
      name: "received style remains forwardable",
      code: sfc(
        `const { style } = defineProps<{ style?: object }>()`,
        `<div :style="{ '--gap': '4px', ...style }" />`
      ),
      expected: [],
    },
  ])("$name", ({ code, expected }) => {
    expect(messages(code)).toEqual(expected)
  })
})

describe("CSS color leaves", () => {
  test.each([
    ["color word at the end of a URL", "url(/icons/red)", []],
    ["color word inside a URL", "url(/assets/blue/icon.svg)", []],
    ["URL hash", "url(/icons.svg#abc)", []],
    ["quoted URL", 'url("/icons/red")', []],
    ["uppercase URL function", "URL(/icons/red)", []],
    ["quoted parentheses in a URL", 'url("/icons/)red")', []],
    ["escaped parentheses in a URL", String.raw`url(/icons/\)red)`, []],
    ["nested image URLs", "image-set(url(/red) 1x, url(/blue) 2x)", []],
    ["SVG data URL", "url(\"data:image/svg+xml,<svg fill='red'/>\")", []],
    ["CSS string", '"red blue #abc rgb(0 0 0)"', []],
    ["CSS comment", "4px /* red #abc rgb(0 0 0) */", []],
    ["token reference", "var(--color-primary)", []],
    ["named color outside a URL", "url(/icons/red) blue", ["customPropColor"]],
    ["named gradient", "linear-gradient(red, blue)", ["customPropColor"]],
    [
      "color function",
      "linear-gradient(rgb(0 0 0), var(--color-primary))",
      ["customPropColor"],
    ],
    ["shadow color", "0 0 4px red", ["customPropColor"]],
  ])("%s", (_name, value, expected) => {
    const code = sfc(
      `const icon = ${JSON.stringify(value)}`,
      `<div class="bg-(image:--icon)" :style="{ '--icon': icon }" />`
    )
    expect(messages(code)).toEqual(expected)
  })

  test("a static template still reports its named color", () => {
    expect(messages(template(`<div :style="{ '--tint': \`red\` }" />`))).toEqual(
      ["customPropColor"]
    )
  })

  test("a template URL keeps all literal pieces inside the URL", () => {
    expect(
      messages(
        template(`<div :style="{ '--icon': \`url(/icons/\${name}/red)\` }" />`)
      )
    ).toEqual([])
  })
})