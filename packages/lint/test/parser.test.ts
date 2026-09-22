// The cross-file analyses read TypeScript modules through whichever
// parser is available: oxc-parser when installed, @typescript-eslint/
// parser otherwise. Both must give the same answers. A Vue component is
// read another way — parseSfc splits the SFC and hands its script to the
// TypeScript parser — so the variants and wrappers of a .vue file must
// not depend on the parser that is active either.

import * as fs from "node:fs"
import * as path from "node:path"
import { describe, expect, test } from "vitest"

import {
  activeParserKind,
  createParser,
  useParser,
  type ParserKind,
} from "../src/project/parser"
import { parseSfc } from "../src/project/sfc"
import {
  definitionsOfProgram,
  extractVariantDefinitions,
} from "../src/project/variants"
import { clearWrapperCache, wrapperTargetOf } from "../src/project/wrappers"
import { PROJECT } from "./helpers"

const NO_JSON = path.join(path.dirname(PROJECT), "no-json")
const COMPONENTS = path.join(PROJECT, "components")

const hasOxc = (() => {
  try {
    createParser("oxc")
    return true
  } catch {
    return false
  }
})()

const KINDS: ParserKind[] = hasOxc ? ["oxc", "typescript"] : ["typescript"]

describe("parser", () => {
  test("oxc-parser is the default when installed", () => {
    useParser(null)
    expect(activeParserKind()).toBe(hasOxc ? "oxc" : "typescript")
  })

  test("both parsers read the same variant axes", () => {
    // A .vue file's script is parsed by parseSfc, which wires the
    // TypeScript parser itself: the active parser kind cannot change
    // what the script declares.
    const files = [
      path.join(PROJECT, "components/ui/button/Button.vue"),
      path.join(NO_JSON, "src/ds/button/Button.vue"),
    ]
    for (const file of files) {
      const source = fs.readFileSync(file, "utf-8")
      const results = KINDS.map((kind) => {
        useParser(kind)
        const program = parseSfc(source, file)?.program
        return program ? definitionsOfProgram(program, file) : []
      })
      expect(results[0].length).toBeGreaterThan(0)
      for (const result of results.slice(1)) expect(result).toEqual(results[0])
    }
    useParser(null)
  })

  test("both parsers read an alias, a lookup object and a props union", () => {
    const source = `
      const VARIANTS = { primary: "", secondary: "" } as const
      type ButtonVariant = keyof typeof VARIANTS
      type Base = { variant?: ButtonVariant }
      type ButtonProps = (Base & { href: string }) | (Base & { href?: undefined })
      export function Button(props: ButtonProps) { return null }
    `
    const results = KINDS.map((kind) => {
      useParser(kind)
      return extractVariantDefinitions(source, "button.ts")
    })
    expect(results[0]).toEqual([
      {
        name: "Button",
        axes: { variant: ["primary", "secondary"] },
        source: "props",
      },
    ])
    for (const result of results.slice(1)) expect(result).toEqual(results[0])
    useParser(null)
  })

  test("both parsers find the same wrappers", () => {
    const cases: [string, string][] = [
      [path.join(COMPONENTS, "SaveButton.vue"), "SaveButton"],
      [path.join(COMPONENTS, "Section.vue"), "Section"],
      [path.join(COMPONENTS, "CancelButton.vue"), "CancelButton"],
      [path.join(COMPONENTS, "PrimaryAction.vue"), "PrimaryAction"],
      [path.join(COMPONENTS, "FixedButton.vue"), "FixedButton"],
    ]
    for (const [file, name] of cases) {
      const results = KINDS.map((kind) => {
        useParser(kind)
        clearWrapperCache()
        return wrapperTargetOf(file, name)
      })
      for (const result of results.slice(1)) expect(result).toEqual(results[0])
    }
    useParser(null)
    clearWrapperCache()
  })

  test("a file that cannot forward the class is not parsed", () => {
    const file = path.join(PROJECT, "components/ui/card/Card.vue")
    // Card's class lands on its own plain <div>, so this is a control:
    // the answer does not depend on the parser.
    useParser(null)
    clearWrapperCache()
    expect(wrapperTargetOf(file, "Card")).toBeNull()
  })
})
