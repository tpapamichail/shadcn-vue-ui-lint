// Variants written as a component's props in a script-setup, typed with a
// union of string literals, the same shape as a cva axis without the
// factory: read for the messages' "use an existing variant" list and for
// the size list.

import * as fs from "node:fs"
import * as os from "node:os"
import * as path from "node:path"
import { describe, expect, test } from "vitest"

import {
  sizeNamesFor,
  variantDefinitionsOf,
  variantNamesFor,
} from "../src/project/variants"
import { sfc } from "./helpers"

// A component file on disk: a .vue file is one component, and the name
// its props belong to is the one the filename gives it.
function component(name: string, script: string) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "shadcn-lint-variants-"))
  const file = path.join(dir, name)
  fs.writeFileSync(file, sfc(script, `<div />`))
  return file
}

describe("variants from props", () => {
  test("an inline props type in a script-setup", () => {
    const file = component(
      "Text.vue",
      `
      const props = defineProps<{
        class?: string
        variant?: "default" | "h1" | "h2" | "h3"
      }>()
    `
    )
    expect(variantDefinitionsOf(file)).toEqual([
      {
        name: "Text",
        axes: { variant: ["default", "h1", "h2", "h3"] },
        source: "props",
      },
    ])
  })

  test("withDefaults keeps the axes of the props it wraps", () => {
    const file = component(
      "Card.vue",
      `
      const props = withDefaults(
        defineProps<{ size?: "default" | "sm"; class?: string }>(),
        { size: "default" }
      )
    `
    )
    // The inner defineProps call records the same axes, so the read is
    // asserted through the component's name rather than the raw list.
    expect(sizeNamesFor(file, "Card")).toEqual(["default", "sm"])
  })

  test("a props type alias or interface referenced by name", () => {
    const badge = component(
      "Badge.vue",
      `
      type BadgeProps = { tone?: "neutral" | "info"; variant?: "solid" | "outline" }
      const props = defineProps<BadgeProps>()
    `
    )
    expect(variantDefinitionsOf(badge)).toEqual([
      {
        name: "Badge",
        axes: { tone: ["neutral", "info"], variant: ["solid", "outline"] },
        source: "props",
      },
    ])
    const chip = component(
      "Chip.vue",
      `
      interface ChipProps extends Base { size?: "sm" | "lg"; label: string }
      const props = defineProps<ChipProps>()
    `
    )
    expect(variantDefinitionsOf(chip)).toEqual([
      { name: "Chip", axes: { size: ["sm", "lg"] }, source: "props" },
    ])
  })

  test("an alias on the prop, and keyof typeof a lookup object", () => {
    const file = component(
      "Button.vue",
      `
      const VARIANTS = { primary: "bg-accent", secondary: "bg-accent-soft" } as const
      type ButtonVariant = keyof typeof VARIANTS
      type ButtonSize = "sm" | "lg"
      type ButtonProps = { variant?: ButtonVariant; size?: ButtonSize; class?: string }
      const props = defineProps<ButtonProps>()
    `
    )
    expect(variantDefinitionsOf(file)).toEqual([
      {
        name: "Button",
        axes: { variant: ["primary", "secondary"], size: ["sm", "lg"] },
        source: "props",
      },
    ])
  })

  test("a lookup object a spread or a computed key hides is not a list", () => {
    const file = component(
      "Tag.vue",
      `
      const VARIANTS = { ...BASE, primary: "bg-accent" } as const
      type Props = { variant?: keyof typeof VARIANTS }
      const props = defineProps<Props>()
    `
    )
    expect(variantDefinitionsOf(file)).toEqual([])
  })

  // A component that renders as an anchor or a button declares its props
  // as a union: the variants it accepts are the ones every member does.
  test("a props union keeps the variants every member accepts", () => {
    const file = component(
      "Button.vue",
      `
      type Base = { variant?: "primary" | "secondary"; class?: string }
      type AsLink = Base & { href: string }
      type AsButton = Base & { type?: "button" | "submit" }
      type ButtonProps = AsLink | AsButton
      const props = defineProps<ButtonProps>()
    `
    )
    expect(variantDefinitionsOf(file)).toEqual([
      {
        name: "Button",
        axes: { variant: ["primary", "secondary"] },
        source: "props",
      },
    ])
  })

  test("a variant one member of the union does not accept is left out", () => {
    const file = component(
      "Chip.vue",
      `
      type AsLink = { variant?: "primary" | "ghost" }
      type AsButton = { variant?: "primary" }
      type ChipProps = AsLink | AsButton
      const props = defineProps<ChipProps>()
    `
    )
    expect(variantDefinitionsOf(file)).toEqual([
      { name: "Chip", axes: { variant: ["primary"] }, source: "props" },
    ])
  })

  test("non-literal unions and plain strings are not axes", () => {
    const file = component(
      "Field.vue",
      `
      const props = defineProps<{
        label: string
        kind?: Kind | "auto"
        width?: number | "full"
      }>()
    `
    )
    expect(variantDefinitionsOf(file)).toEqual([])
  })

  test("a cva named after the component still wins over its props", () => {
    const file = component(
      "Button.vue",
      `
      const buttonVariants = cva("", { variants: { variant: { default: "", ghost: "" } } })
      const props = defineProps<{ variant?: "default" | "ghost" | "unlisted" }>()
    `
    )
    expect(variantNamesFor(file, "Button")).toEqual(["default", "ghost"])
  })

  test("a file's props belong to the component its filename names", () => {
    const file = component(
      "Card.vue",
      `const props = defineProps<{ size?: "default" | "sm" }>()`
    )
    expect(sizeNamesFor(file, "Card")).toEqual(["default", "sm"])
    expect(sizeNamesFor(file, "CardTitle")).toBeNull()
  })

  test("variantNamesFor reads an alias and a lookup object from the file", () => {
    const file = component(
      "Button.vue",
      `
      const VARIANTS = { primary: "", secondary: "" } as const
      type ButtonVariant = keyof typeof VARIANTS
      const props = defineProps<{ variant?: ButtonVariant }>()
    `
    )
    expect(variantNamesFor(file, "Button")).toEqual(["primary", "secondary"])
  })

  test("variantNamesFor and sizeNamesFor read the component's props", () => {
    const file = component(
      "Text.vue",
      `const props = defineProps<{ variant?: "default" | "h1"; size?: "sm" | "lg" }>()`
    )
    expect(variantNamesFor(file, "Text")).toEqual(["default", "h1"])
    expect(sizeNamesFor(file, "Text")).toEqual(["sm", "lg"])
  })
})
