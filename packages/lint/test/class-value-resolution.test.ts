import tsParser from "@typescript-eslint/parser"
import { Linter } from "eslint"
import { describe, expect, test } from "vitest"
import vueParser from "vue-eslint-parser"

import { plugin } from "../src/index"
import { noRestyle } from "../src/rules/no-restyle"
import { requireStaticClasses } from "../src/rules/require-static-classes"
import { button, cn, createTester, PAGE, PROJECT, sfc } from "./helpers"

function lint(code: string) {
  return new Linter({ cwd: PROJECT }).verify(
    code,
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
        rules: Object.fromEntries(
          Object.keys(plugin.rules).map((rule) => [
            `shadcn-vue/${rule}`,
            // Layout is what a forwarded value usually carries, so the
            // boundary opens it and only appearance is reported.
            rule === "no-restyle" ? ["error", { allow: ["layout"] }] : "error",
          ])
        ) as Linter.RulesRecord,
      },
    ],
    { filename: PAGE }
  )
}

const tester = createTester()

// Layout may cross in these cases: they exercise how a value reaches the
// boundary, not what the boundary allows.
const options = [{ allow: ["layout"] }]

describe("forwarded values retain their local alternatives", () => {
  // The React default-object parameter has no Vue form the collector
  // reads: the destructure default and the runtime prop default below
  // are its two halves.
  test.each([
    [
      `const { class: className = "bg-red-500 rounded-full" } = defineProps<{ class?: string }>()`,
      `<Button :class="className" />`,
    ],
    [
      `const { class: cls = "bg-red-500 rounded-full" } = defineProps<{ class?: string }>()`,
      `<Button :class="cls" />`,
    ],
    [
      `const props = defineProps({ class: { default: "bg-red-500 rounded-full" } })`,
      `<Button :class="props.class" />`,
    ],
  ])("checks prop defaults: %s", (script, markup) => {
    const messages = lint(sfc(`${button}\n${cn}\n${script}`, markup))
    expect(
      messages.filter((m) => m.ruleId === "shadcn-vue/no-restyle")
    ).toHaveLength(2)
    expect(
      messages.filter((m) => m.ruleId === "shadcn-vue/no-raw-colors")
    ).toHaveLength(1)
    expect(
      messages.some((m) => m.ruleId === "shadcn-vue/require-static-classes")
    ).toBe(false)
  })

  // A Vue local is a binding the script can write, so these are the
  // writes that revoke the value it reads.
  test.each([
    [
      `let { class: cls } = { class: "w-full" }\ncls ??= "bg-red-500"`,
      `<Button :class="cls" />`,
    ],
    [
      `let { class: cls } = { class: "w-full" }\ncls = "bg-red-500"`,
      `<Button :class="cls" />`,
    ],
    [
      `let props = { class: "w-full" }\nprops = { class: "bg-red-500" }`,
      `<Button :class="props.class" />`,
    ],
    [
      `let props = { class: "w-full" }\nprops.class = "bg-red-500"`,
      `<Button :class="props.class" />`,
    ],
    [
      `let props = { class: "w-full" }\nprops.class ??= "bg-red-500"`,
      `<Button :class="props.class" />`,
    ],
    [
      `let props = { class: "w-full" }\nObject.assign(props, { class: "bg-red-500" })`,
      `<Button :class="props.class" />`,
    ],
    [
      `let props = { class: "w-full" }\nObject.assign(props as object, { class: "bg-red-500" })`,
      `<Button :class="props.class" />`,
    ],
    [
      `let props = { class: "w-full" }\n({ class: props.class } = { class: "bg-red-500" })`,
      `<Button :class="props.class" />`,
    ],
    [
      `let props = { class: "w-full" }\n[props.class] = ["bg-red-500"]`,
      `<Button :class="props.class" />`,
    ],
  ])("revokes reading after a write: %s", (script, markup) => {
    expect(
      lint(sfc(`${button}\n${cn}\n${script}`, markup)).map((m) => m.ruleId)
    ).toContain("shadcn-vue/require-static-classes")
  })

  test.each([
    `const alias = theme\nalias.class = "bg-red-500"`,
    `let alias\nalias = theme`,
    `mutate(theme)`,
    `const stored = { theme }`,
    `function expose() { return theme }`,
    `const expose = () => theme`,
    `const alias = theme as object`,
  ])("treats an escaped object's member as uncertain: %s", (escape) => {
    const code = sfc(
      `${button}\n${cn}\nconst theme = { class: "w-full" }\n${escape}`,
      `<Button :class="theme.class" />`
    )
    expect(lint(code).map((m) => m.ruleId)).toContain(
      "shadcn-vue/require-static-classes"
    )
  })

  // Dropped: Vue props are read-only, so escaping the received object
  // does not revoke it; the plain-object escapes above are the ones the
  // collector revokes.

  test.each([
    [
      `const { class: className } = defineProps<{ class?: string }>()`,
      `<Button :class="className" />`,
    ],
    [
      `const { class: cls } = defineProps<{ class?: string }>()`,
      `<Button :class="cls" />`,
    ],
    [
      `const props = defineProps<{ class?: string }>()`,
      `<Button :class="props.class" v-bind="props" />`,
    ],
    [`const attrs = useAttrs()`, `<Button :class="attrs.class" />`],
    [
      `const props = defineProps<{ class?: string; disabled?: boolean }>()\nconst { disabled } = props`,
      `<Button :class="props.class" :disabled="disabled" />`,
    ],
    [
      `const { class: className = "w-full" } = defineProps<{ class?: string }>()`,
      `<Button :class="cn('mt-4', className)" />`,
    ],
    [
      `const theme = { class: "w-full" }\nread(theme.class)`,
      `<Button :class="theme.class" v-bind="theme" />`,
    ],
    [
      `const theme = { class: "w-full" }\nconst copy = { ...theme }`,
      `<Button :class="theme.class" />`,
    ],
    [
      `const classes = { root: "w-full" }`,
      `<Button v-bind="{ class: classes }" />`,
    ],
    [`const classes = { "w-full": true }`, `<Button :class="cn(classes)" />`],
    [`const spacing = { "--gap": "4px" }`, `<div :style="spacing" />`],
    [`import { props } from "./opaque"`, `<Button v-bind="props" />`],
    [
      `const props = defineProps<{ class?: string }>()`,
      `<Button v-bind="props" />`,
    ],
  ])(
    "keeps untouched values and non-escaping reads clean: %s",
    (script, markup) => {
      expect(lint(sfc(`${button}\n${cn}\n${script}`, markup))).toEqual([])
    }
  )

  test("a helper call escapes an object for later member reads", () => {
    expect(
      lint(
        sfc(
          `${button}\n${cn}\nconst classes = { root: "w-full" }\ncn(classes)`,
          `<Button :class="classes.root" />`
        )
      ).map((m) => m.ruleId)
    ).toContain("shadcn-vue/require-static-classes")
  })

  test.each([
    [
      `const classes = { root: "w-full" }\nconst alias = classes\nalias.root = "bg-red-500"`,
      `<Button v-bind="{ class: classes }" />`,
    ],
    [
      `const classes = { "w-full": true }\nconst alias = classes\nalias["bg-red-500"] = true`,
      `<Button :class="cn(classes)" />`,
    ],
    [
      `const styles = { "--gap": "4px" }\nconst alias = styles\nalias.color = "red"`,
      `<div :style="styles" />`,
    ],
    [
      `const classes = { root: "w-full" }\nmutate(classes)`,
      `<Button v-bind="{ class: classes }" />`,
    ],
  ])(
    "does not trust an escaped object at a class or style site: %s",
    (script, markup) => {
      expect(
        lint(sfc(`${button}\n${cn}\n${script}`, markup)).some((m) =>
          [
            "shadcn-vue/require-static-classes",
            "shadcn-vue/no-inline-styles",
          ].includes(m.ruleId ?? "")
        )
      ).toBe(true)
    }
  )

  test.each([
    [
      `const classes = { root: "w-full" }`,
      `<Button v-bind="{ class: classes }" /><Button v-bind="{ class: classes }" />`,
    ],
    [
      `const classes = { "w-full": true }`,
      `<Button :class="cn(classes)" /><Button :class="cn(classes)" />`,
    ],
    [
      `const styles = { "--gap": "4px" }`,
      `<div :style="styles" /><div :style="styles" />`,
    ],
  ])(
    "can check the same literal object at multiple styling sites: %s",
    (script, markup) => {
      expect(lint(sfc(`${button}\n${cn}\n${script}`, markup))).toEqual([])
    }
  )

  test("a dynamic default is not an untouched forwarded value", () => {
    expect(
      lint(
        sfc(
          `${button}\n${cn}\nconst { class: className = build() } = defineProps<{ class?: string }>()`,
          `<Button :class="className" />`
        )
      ).map((m) => m.ruleId)
    ).toContain("shadcn-vue/require-static-classes")
  })

  test("a forwarded interpolation glued to text is uncertain", () => {
    expect(
      lint(
        sfc(
          `${button}\n${cn}\nconst { class: className } = defineProps<{ class?: string }>()`,
          `<Button :class="\`prefix-\${className}\`" />`
        )
      ).map((m) => m.ruleId)
    ).toContain("shadcn-vue/require-static-classes")
  })
})

describe("partly understood values stay unresolved", () => {
  test("require-static-classes sees the unreadable part", () => {
    tester.run("require-static-classes", requireStaticClasses as any, {
      valid: [
        // Forwarded by provenance: a destructured class prop.
        {
          filename: PAGE,
          code: sfc(
            `${button}\nconst { class: className } = defineProps<{ class?: string }>()`,
            `<Button :class="className">Go</Button>`
          ),
        },
      ],
      invalid: [
        // A number glued to text is a class the collector cannot read.
        {
          filename: PAGE,
          code: sfc(
            `${button}\nconst n = 8`,
            `<Button :class="\`p-\${n}\`">Go</Button>`
          ),
          errors: [{ messageId: "dynamicClasses" }],
        },
        // Spelled class, but not the component's prop.
        {
          filename: PAGE,
          code: sfc(
            `${button}\nlet className\nclassName ??= "bg-red-500"`,
            `<Button :class="className">Go</Button>`
          ),
          errors: [{ messageId: "dynamicClasses" }],
        },
        // An object written to after creation.
        {
          filename: PAGE,
          code: sfc(
            `${button}\nconst theme = { className: "mt-4" }\ntheme.className = "bg-red-500"`,
            `<Button :class="theme.className">Go</Button>`
          ),
          errors: [{ messageId: "dynamicClasses" }],
        },
        // A member of an imported object.
        {
          filename: PAGE,
          code: sfc(
            `${button}\nimport { theme } from "./theme"`,
            `<Button :class="theme.className">Go</Button>`
          ),
          errors: [{ messageId: "dynamicClasses" }],
        },
      ],
    })
  })

  test("the boundary reads the final value of an object", () => {
    tester.run("no-restyle", noRestyle as any, {
      valid: [
        // A later spread may override: the literal before it does not decide.
        {
          filename: PAGE,
          options,
          code: sfc(
            button,
            `<Button v-bind="{ class: 'bg-red-500', ...{ class: 'mt-4' } }" />`
          ),
        },
      ],
      invalid: [
        // The last write wins.
        {
          filename: PAGE,
          options,
          code: sfc(
            `${button}\nconst base = { class: "mt-4" }`,
            `<Button v-bind="{ ...base, class: 'bg-red-500' }" />`
          ),
          errors: [{ messageId: "appearanceClassWithVariants" }],
        },
        // Nested spreads and static computed keys.
        {
          filename: PAGE,
          options,
          code: sfc(
            button,
            `<Button v-bind="{ ...{ class: 'bg-red-500' } }" />`
          ),
          errors: [{ messageId: "appearanceClassWithVariants" }],
        },
        {
          filename: PAGE,
          options,
          code: sfc(button, `<Button v-bind="{ ['class']: 'bg-red-500' }" />`),
          errors: [{ messageId: "appearanceClassWithVariants" }],
        },
        // A nested class map is read by its values.
        {
          filename: PAGE,
          options,
          code: sfc(
            button,
            `<Button v-bind="{ class: { inner: 'bg-red-500' } }">Go</Button>`
          ),
          errors: [{ messageId: "appearanceClassWithVariants" }],
        },
        // A same-file object never written to is read.
        {
          filename: PAGE,
          options,
          code: sfc(
            `${button}\nconst theme = { className: "bg-red-500" }`,
            `<Button :class="theme.className">Go</Button>`
          ),
          errors: [{ messageId: "appearanceClassWithVariants" }],
        },
      ],
    })
  })
})
