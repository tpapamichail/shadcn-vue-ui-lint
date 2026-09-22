// A ui component's default export is indexed under the component's own
// name — a .vue file is its component — so an import of it, or of a
// barrel that re-exports it, still names that component.

import * as fs from "node:fs"
import * as os from "node:os"
import * as path from "node:path"
import { afterEach, beforeEach, expect, test } from "vitest"

import { componentsFor } from "../src/project/components"
import { resetFsMemo } from "../src/project/fs"
import { template } from "./helpers"

let root: string

function write(name: string, source: string) {
  const file = path.join(root, name)
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, source)
  return file
}

beforeEach(() => {
  resetFsMemo()
  root = fs.realpathSync.native(
    fs.mkdtempSync(path.join(os.tmpdir(), "lint-default-exports-"))
  )
  write("package.json", JSON.stringify({ private: true }))
  write(
    "components.json",
    JSON.stringify({ aliases: { ui: "@/components/ui" } })
  )
  write(
    "tsconfig.json",
    JSON.stringify({ compilerOptions: { paths: { "@/*": ["./*"] } } })
  )
})

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true })
})

test("a .vue component's default export is indexed under its own name", () => {
  const chip = write(
    "components/ui/LegacyChip.vue",
    template(`<span data-slot="legacy-chip" />`)
  )
  const index = componentsFor(path.join(root, "app/page.vue"))
  expect(index.has("LegacyChip")).toBe(true)
  expect(index.files.get("LegacyChip")).toBe(chip)
  expect(index.has("default")).toBe(false)
})

test("a re-exported default keeps the component's name", () => {
  const button = write(
    "components/ui/button/Button.vue",
    template(`<button data-slot="button" />`)
  )
  write(
    "components/ui/button/index.ts",
    `export { default } from "./Button.vue"\n`
  )
  const index = componentsFor(path.join(root, "app/page.vue"))
  expect(index.has("Button")).toBe(true)
  expect(index.files.get("Button")).toBe(button)
  expect(index.has("default")).toBe(false)
})
