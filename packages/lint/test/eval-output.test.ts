// The eval harness (packages/evals) classifies Vue workdirs: the work
// dir holds Vue SFCs plus ui cva modules, and lib/classify.mjs reads
// variant definitions from any changed ui source through the plugin's
// own variantDefinitionsOf. These cases pin those identity rules on the
// files the Vue harness produces: a ui cva module (the variants.ts a
// barrel re-exports) and a .vue task file.

import * as fs from "node:fs"
import * as os from "node:os"
import * as path from "node:path"
import { pathToFileURL } from "node:url"
import { afterEach, describe, expect, test } from "vitest"

const evals = path.resolve(import.meta.dirname, "../../evals")
// packages/evals is a private, untyped workspace sibling: the path is
// resolved at run time, so it cannot be a static import.
const { classifyRedirect } = await import(
  pathToFileURL(path.join(evals, "lib/classify.mjs")).href
)
const dirs: string[] = []

function workdir(files: Record<string, string>) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lint-eval-regression-"))
  dirs.push(dir)
  fs.symlinkSync(
    path.join(evals, "node_modules"),
    path.join(dir, "node_modules")
  )
  for (const [file, source] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true })
    fs.writeFileSync(path.join(dir, file), source)
  }
  return dir
}

afterEach(() => {
  for (const dir of dirs.splice(0))
    fs.rmSync(dir, { recursive: true, force: true })
})

describe("eval variants retain definition identity", () => {
  function classify(before: string, after: string) {
    const fixtureDir = workdir({ "components/ui/card/variants.ts": before })
    const dir = workdir({ "components/ui/card/variants.ts": after })
    return classifyRedirect({
      workdir: dir,
      fixtureDir,
      task: { file: "app/page.vue" },
      findings: [],
    })
  }

  test("detects an addition already present on another definition", () => {
    const button = `const buttonVariants = cva('', { variants: { size: { sm: 'h-4', lg: 'h-8' } } });`
    expect(
      classify(
        `${button} const cardVariants = cva('', { variants: { size: { sm: 'p-2' } } })`,
        `${button} const cardVariants = cva('', { variants: { size: { sm: 'p-2', lg: 'p-6' } } })`
      )
    ).toBe("variant-added")
  })

  test("does not hide an addition behind a different definition's removal", () => {
    expect(
      classify(
        `const buttonVariants = cva('', { variants: { size: { sm: 'h-4', lg: 'h-8' } } }); const cardVariants = cva('', { variants: { size: { sm: 'p-2' } } })`,
        `const buttonVariants = cva('', { variants: { size: { sm: 'h-4' } } }); const cardVariants = cva('', { variants: { size: { sm: 'p-2', lg: 'p-6' } } })`
      )
    ).toBe("variant-added")
  })

  test("matches renamed reductions without depending on declaration order", () => {
    expect(
      classify(
        `const one = cva('', { variants: { size: { sm: '', lg: '', xl: '' } } }); const two = cva('', { variants: { size: { sm: '', lg: '' } } })`,
        `const renamedOne = cva('', { variants: { size: { sm: '' } } }); const renamedTwo = cva('', { variants: { size: { xl: '' } } })`
      )
    ).toBe("ui-modified")
  })

  test("does not count a pure rename or compound-only edit", () => {
    const before = `const cardVariants = cva('', { variants: { size: { sm: 'p-2' } } })`
    expect(
      classify(before, before.replace("cardVariants", "renamedVariants"))
    ).toBe("ui-modified")
    expect(
      classify(
        before,
        `const cardVariants = cva('', { variants: { size: { sm: 'p-2' } } }, compoundVariants: [{ size: 'sm', class: 'p-4' }] })`
      )
    ).toBe("ui-modified")
  })

  test("detects an addition while renaming and reordering definitions", () => {
    expect(
      classify(
        `const buttonVariants = cva('', { variants: { size: { sm: 'h-4', lg: 'h-8' } } }); const cardVariants = cva('', { variants: { size: { sm: 'p-2' } } })`,
        `const renamedCard = cva('', { variants: { size: { sm: 'p-2', lg: 'p-6' } } }); const renamedButton = cva('', { variants: { size: { sm: 'h-4', lg: 'h-8' } } })`
      )
    ).toBe("variant-added")
  })

  test("detects a new definition even when its values already exist", () => {
    const before = `const cardVariants = cva('', { variants: { size: { sm: 'p-2' } } });`
    expect(
      classify(
        before,
        `${before} const extraVariants = tv({ slots: { root: 'flex' }, variants: { size: { sm: { root: 'p-2' } } } })`
      )
    ).toBe("variant-added")
  })

  test("does not count an empty variant axis as an added value", () => {
    expect(
      classify(
        "export const styles = 'flex'",
        "export const styles = cva('flex', { variants: { size: {} } })"
      )
    ).toBe("ui-modified")
  })
})