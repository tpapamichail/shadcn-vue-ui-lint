import * as path from "node:path"
import { describe, expect, test } from "vitest"

import { componentsFor } from "../src/project/components"
import { findProject, uiDirectory } from "../src/project/components-json"
import { colorTokensFor, parseColorTokens } from "../src/project/theme"
import {
  extractVariantDefinitions,
  variantDefinitionsOf,
  variantNamesFor,
} from "../src/project/variants"

const PROJECT = path.join(__dirname, "fixtures/project")
const PAGE = path.join(PROJECT, "app/page.vue")

describe("components.json", () => {
  test("found by walking up from the linted file", () => {
    const project = findProject(PAGE)
    expect(project?.dir).toBe(PROJECT)
    expect(project?.cssFile).toBe(path.join(PROJECT, "app/globals.css"))
  })

  test("ui alias resolves to the components directory", () => {
    const project = findProject(PAGE)!
    expect(uiDirectory(project)).toBe(path.join(PROJECT, "components/ui"))
  })

  test("no project outside one", () => {
    expect(findProject("/nonexistent/app/page.vue")).toBeNull()
  })
})

describe("component index", () => {
  test("names every exported component, including compound parts", () => {
    const index = componentsFor(PAGE)
    for (const name of [
      "Button",
      "Card",
      "CardTitle",
      "CardContent",
      "Field",
      "FieldLabel",
    ]) {
      expect(index.has(name), name).toBe(true)
    }
    expect(index.files.get("CardTitle")).toBe(
      path.join(PROJECT, "components/ui/card/CardTitle.vue")
    )
  })

  test("is keyed by name, so re-exports do not matter", () => {
    // widgets.ts re-exports Button from outside the ui directory. The
    // index knows Button regardless of where an import points.
    expect(componentsFor(PAGE).has("Button")).toBe(true)
  })

  test("empty outside a project", () => {
    expect(componentsFor("/nonexistent/app/page.vue").has("Button")).toBe(false)
  })
})

describe("theme tokens", () => {
  test("parses --color-* declarations inside @theme blocks only", () => {
    const tokens = parseColorTokens(`
      :root { --brand: #ff6b35; --color-not-a-token: red; }
      @theme inline {
        --color-primary: var(--primary);
        --color-brand-foreground: var(--brand-foreground);
        --radius-lg: var(--radius);
      }
      @theme { --color-neon: #39ff14; }
    `)
    expect([...tokens].sort()).toEqual(["brand-foreground", "neon", "primary"])
  })

  test("reads the project's theme through components.json", () => {
    const tokens = colorTokensFor(PAGE)
    expect(tokens?.has("primary")).toBe(true)
    expect(tokens?.has("destructive")).toBe(true)
    expect(tokens?.has("pink")).toBe(false)
  })

  test("null outside a project", () => {
    expect(colorTokensFor("/nonexistent/app/page.vue")).toBeNull()
  })
})

describe("variant definitions", () => {
  test("every definition and every axis, not just `variant`", () => {
    const source = `
      const fieldVariants = cva("base", { variants: { orientation: { vertical: "", horizontal: "" } } })
      const labelVariants = cva("base", { variants: { variant: { default: "", muted: "" }, size: { sm: "" } } })
      const notVariants = tv({ base: "x" })
    `
    expect(extractVariantDefinitions(source)).toEqual([
      {
        name: "fieldVariants",
        axes: { orientation: ["vertical", "horizontal"] },
        source: "factory",
      },
      {
        name: "labelVariants",
        axes: { variant: ["default", "muted"], size: ["sm"] },
        source: "factory",
      },
    ])
  })

  test("picks <component>Variants when a file has several", () => {
    const label = path.join(PROJECT, "components/ui/field/FieldLabel.vue")
    expect(variantNamesFor(label, "FieldLabel")).toEqual(["default", "muted"])
    // Field's only axis is orientation, so there is no variant list.
    const field = path.join(PROJECT, "components/ui/field/Field.vue")
    expect(variantNamesFor(field, "Field")).toBeNull()
  })

  test("reads the real button", () => {
    const file = path.join(PROJECT, "components/ui/button/Button.vue")
    const names = variantNamesFor(file, "Button")
    expect(names).toContain("default")
    expect(names).toContain("destructive")
    expect(names).toContain("ghost")
  })
})

describe("tv() reads its config from the first argument", () => {
  test("slots and variants are found", () => {
    const [definition] = variantDefinitionsOf(
      path.join(PROJECT, "components/ui/tv-chip/TvChip.vue")
    )
    expect(definition?.axes).toEqual({ tone: ["neutral", "loud"] })
  })
})
