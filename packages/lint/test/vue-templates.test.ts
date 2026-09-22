import * as path from "node:path"
import tsParser from "@typescript-eslint/parser"
import { Linter } from "eslint"
import { afterEach, beforeEach, describe, expect, test } from "vitest"

import { plugin } from "../src/index"
import { resetWarnings, setWarningSink } from "../src/project/warn"
import { noUnknownClasses } from "../src/rules/no-unknown-classes"
import { oracleAvailable, resetOracleMemo } from "../src/tailwind/client"
import { createTester, PAGE, PROJECT } from "./helpers"

const tester = createTester()

// A script-only .vue file parses under the plain TypeScript parser, so
// its parserServices carry no template visitor — the way a run without
// vue-eslint-parser reads every .vue file.
const scriptLinter = new Linter({ cwd: PROJECT })
const scriptLint = (filename: string, code: string, rule = "no-unknown-classes") =>
  scriptLinter.verify(
    code,
    [
      {
        files: ["**/*.{vue,ts}"],
        languageOptions: {
          parser: tsParser,
          parserOptions: { sourceType: "module" },
        },
        plugins: { "shadcn-vue": plugin },
        rules: { [`shadcn-vue/${rule}`]: "error" },
      },
    ] as any,
    { filename }
  )

// With the built worker present, the project's Tailwind answers and
// names the fix; without it, the bundled grammar answers.
const oracle = oracleAvailable()

const unknown = (code: string, className: string, suggestion: string | null) =>
  oracle && suggestion
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

const warnings: string[] = []
beforeEach(() => {
  warnings.length = 0
  resetWarnings()
  setWarningSink((message) => warnings.push(message))
})
afterEach(() => setWarningSink((message) => console.warn(message)))

describe("vue templates", () => {
  test("knows the classes its own style block declares", () => {
    resetOracleMemo()
    const code = `<template><div class="box flex-cols" /></template>\n<style scoped>\n.box { color: red }\n</style>\n`
    tester.run("no-unknown-classes", noUnknownClasses as any, {
      valid: [
        // An unscoped style block declares the same way.
        {
          filename: PAGE,
          code: `<template><div class="box" /></template>\n<style>\n.box { color: red }\n</style>\n`,
        },
      ],
      invalid: [
        // The declared class settles; an undefined one next to it is
        // still reported.
        {
          filename: PAGE,
          code,
          errors: [unknown(code, "flex-cols", oracle ? "flex-col" : null)],
        },
      ],
    })
  })

  test("warns once when a .vue file arrives without the template parser", () => {
    const code = `const classes = "flex p-4"\n`
    // Linted twice; the warning says so once.
    expect(scriptLint(PAGE, code)).toEqual([])
    expect(scriptLint(PAGE, code)).toEqual([])
    expect(
      warnings.filter((message) => message.includes("no template parser"))
    ).toHaveLength(1)
  })

  test("does not warn for a plain .ts file", () => {
    expect(
      scriptLint(path.join(PROJECT, "app/page.ts"), `const classes = "flex p-4"\n`)
    ).toEqual([])
    expect(
      warnings.filter((message) => message.includes("no template parser"))
    ).toHaveLength(0)
  })

  test("no-inline-styles warns instead of throwing on the same file", () => {
    const code = `const styles = { color: "red" }\n`
    expect(scriptLint(PAGE, code, "no-inline-styles")).toEqual([])
    expect(
      warnings.filter((message) => message.includes("no template parser"))
    ).toHaveLength(1)
  })
})
