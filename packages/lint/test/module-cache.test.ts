import * as fs from "node:fs"
import * as os from "node:os"
import * as path from "node:path"
import { afterEach, beforeEach, expect, test, vi } from "vitest"

import { mtimeOf, resetFsMemo } from "../src/project/fs"
import { definingExportOf, exportsOf } from "../src/project/modules"

let root: string

function write(name: string, source: string) {
  const file = path.join(root, name)
  fs.writeFileSync(file, source)
  const time = new Date(Date.now())
  fs.utimesSync(file, time, time)
  return file
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] })
  resetFsMemo()
  root = fs.realpathSync.native(
    fs.mkdtempSync(path.join(os.tmpdir(), "lint-exports-"))
  )
  write("package.json", JSON.stringify({ private: true }))
})

afterEach(() => {
  vi.useRealTimers()
  resetFsMemo()
  fs.rmSync(root, { recursive: true, force: true })
})

test("a large barrel shares its complete exports and dependencies across files", () => {
  const entries = []
  const expected = new Set<string>()
  for (let i = 0; i < 200; i++) {
    expected.add(
      write(`control-${i}.ts`, `export const Control${i} = () => null`)
    )
    entries.push(`export { Control${i} } from "./control-${i}"`)
  }
  const barrel = write("index.ts", entries.join("\n"))
  expected.add(barrel)
  const allDeps = new Set<string>()
  const initial = exportsOf(barrel, new Set(), allDeps)
  expect(allDeps).toEqual(expected)
  expect(initial.size).toBe(200)
  for (let i = 0; i < 200; i++) {
    expect(exportsOf(barrel)).toBe(initial)
    const deps = new Set<string>()
    expect(
      definingExportOf(
        "./index",
        `Control${i}`,
        path.join(root, `page-${i}.vue`),
        deps
      )
    ).toEqual({
      file: path.join(root, `control-${i}.ts`),
      name: `Control${i}`,
    })
    expect(deps).toEqual(new Set([barrel, path.join(root, `control-${i}.ts`)]))
  }
})

test("warm cycle members never replace the current traversal's partial view", () => {
  const a = write("a.ts", 'export const A = 1; export * from "./b"')
  const b = write("b.ts", 'export const B = 1; export * from "./a"')
  expect([...exportsOf(a).keys()]).toEqual(["A", "B"])
  expect([...exportsOf(b).keys()]).toEqual(["B", "A"])
  const deps = new Set<string>()
  expect([...exportsOf(b, new Set([a]), deps).keys()]).toEqual(["B"])
  expect(deps).toEqual(new Set([b]))
  expect([...exportsOf(b).keys()]).toEqual(["B", "A"])
})

test("transitive edits, deletion, and recreation refresh a warm barrel", () => {
  const leaf = write("leaf.ts", "export const Before = 1")
  write("middle.ts", 'export * from "./leaf"')
  const barrel = write("index.ts", 'export * from "./middle"')
  expect(exportsOf(barrel).has("Before")).toBe(true)

  vi.setSystemTime(Date.now() + 1500)
  write("leaf.ts", "export const After = 1")
  expect([...exportsOf(barrel).keys()]).toEqual(["After"])

  fs.unlinkSync(leaf)
  vi.setSystemTime(Date.now() + 1500)
  expect(exportsOf(barrel).size).toBe(0)

  write("leaf.ts", "export const Recreated = 1")
  vi.setSystemTime(Date.now() + 1500)
  expect([...exportsOf(barrel).keys()]).toEqual(["Recreated"])
})

test("a missing export target is discovered after the burst expires", () => {
  const barrel = write("index.ts", 'export * from "./missing"')
  expect(exportsOf(barrel).size).toBe(0)
  const leaf = write("missing.ts", "export const Added = 1")
  vi.setSystemTime(Date.now() + 1500)
  const deps = new Set<string>()
  expect(exportsOf(barrel, new Set(), deps).get("Added")).toEqual({
    file: leaf,
    name: "Added",
  })
  expect(deps).toEqual(new Set([barrel, leaf]))
})

test("a changed alias updates the defining file behind a cached barrel", () => {
  const first = write("first.ts", "export const Control = 1")
  const second = write("second.ts", "export const Control = 2")
  write(
    "tsconfig.json",
    JSON.stringify({
      compilerOptions: { paths: { "#control": ["./first.ts"] } },
    })
  )
  const barrel = write("index.ts", 'export { Control } from "#control"')
  expect(exportsOf(barrel).get("Control")?.file).toBe(first)

  vi.setSystemTime(Date.now() + 1500)
  write(
    "tsconfig.json",
    JSON.stringify({
      compilerOptions: { paths: { "#control": ["./second.ts"] } },
    })
  )
  expect(exportsOf(barrel).get("Control")?.file).toBe(second)
})

test("named resolution agrees with full exports through aliases, defaults, and cycles", () => {
  const sources = {
    "leaf.ts":
      "export const Control = 1; export default function DefaultControl() {}",
    "named.ts":
      'export { Control as Action, default as DefaultAction } from "./leaf"',
    "imported.ts":
      'import Default, { Action as Local } from "./named"; export { Local as First }; export { First as Second }; export default Local;',
    "local.ts":
      "const Local = 1; export { Local as First }; export { First as Second }; export { Second as Third }; export { Later as Early }; export { Local as Later };",
    "cycle-a.ts":
      'export const A = 1; export { B as AliasB } from "./cycle-b"; export { AliasA } from "./cycle-b";',
    "cycle-b.ts":
      'export const B = 1; export { A as AliasA } from "./cycle-a"; export { AliasB } from "./cycle-a";',
    "stars.ts":
      'export * from "./cycle-a"; export * from "./named"; export { A as Action } from "./cycle-a";',
    "star-cycle.ts": 'export * from "./star-named"; export const Own = 1;',
    "star-named.ts": 'export { Own, Missing } from "./star-cycle";',
    "fallback.ts":
      'export { Missing } from "./leaf"; export { Missing as Unresolved } from "./absent";',
  }
  for (const [file, source] of Object.entries(sources)) {
    write(file, source)
  }
  for (const file of Object.keys(sources)) {
    const target = path.join(root, file)
    const expected = exportsOf(target)
    for (const name of [...expected.keys(), "default", "Unknown"]) {
      expect(
        definingExportOf(`./${file}`, name, path.join(root, "page.vue")),
        `${file}: ${name}`
      ).toEqual(expected.get(name) ?? { file: target, name })
    }
  }
})

test("named bindings refresh when a barrel redirects, disappears, or gains a target", () => {
  const first = write("first.ts", "export const Control = 1")
  const second = write("second.ts", "export const Control = 2")
  const barrel = write("index.ts", 'export { Control } from "./first"')
  const page = path.join(root, "page.vue")
  const binding = () => definingExportOf("./index", "Control", page)
  expect(binding()).toEqual({ file: first, name: "Control" })

  vi.setSystemTime(Date.now() + 1500)
  write("index.ts", 'export { Control } from "./second"')
  expect(binding()).toEqual({ file: second, name: "Control" })

  vi.setSystemTime(Date.now() + 1500)
  write("index.ts", 'export { Control } from "./later"')
  expect(binding()).toEqual({ file: barrel, name: "Control" })

  const later = write("later.ts", "export const Control = 3")
  vi.setSystemTime(Date.now() + 1500)
  expect(binding()).toEqual({ file: later, name: "Control" })

  fs.unlinkSync(barrel)
  vi.setSystemTime(Date.now() + 1500)
  expect(binding()).toBeNull()
})

test("a closure computed from a stale mtime memo is dropped once the mtime is seen", () => {
  // The scenario: a consumer refreshes its mtime memos, the barrel is
  // edited, a derivation runs while those memos still hold the old
  // mtime, and a second later the consumer revalidates. The derivation
  // must not survive that revalidation with the old content.
  const page = path.join(root, "page.vue")
  write("button.ts", "export const Button = () => null")
  write("badge.ts", "export const Badge = () => null")
  const barrel = write(
    "widgets.ts",
    'export { Button as Action } from "./button"'
  )
  expect(definingExportOf("./widgets", "Action", page)?.file).toBe(
    path.join(root, "button.ts")
  )

  // A consumer revalidates: the mtime memos are refreshed with the old
  // mtime.
  vi.setSystemTime(Date.now() + 1050)
  mtimeOf(barrel)
  mtimeOf(path.join(root, "button.ts"))

  // The barrel is edited, and a derivation runs inside the mtime memo's
  // window.
  vi.setSystemTime(Date.now() + 50)
  write("widgets.ts", 'export { Badge as Action } from "./badge"')
  vi.setSystemTime(Date.now() + 100)
  definingExportOf("./widgets", "Action", page)

  // The mtime memos expire; the binding memo, on its own clock, has not.
  vi.setSystemTime(Date.now() + 950)
  expect(definingExportOf("./widgets", "Action", page)?.file).toBe(
    path.join(root, "badge.ts")
  )
})

test("a star-export closure computed from a stale mtime memo is dropped too", () => {
  write("button.ts", "export const Button = () => null")
  const index = write("index.ts", 'export * from "./button"')
  expect([...exportsOf(index).keys()]).toEqual(["Button"])

  vi.setSystemTime(Date.now() + 1050)
  mtimeOf(index)
  vi.setSystemTime(Date.now() + 50)
  write(
    "index.ts",
    'export * from "./button"\nexport const IconButton = () => null'
  )
  vi.setSystemTime(Date.now() + 100)
  exportsOf(index)

  vi.setSystemTime(Date.now() + 950)
  expect([...exportsOf(index).keys()]).toEqual(["IconButton", "Button"])
})

// React.memo and forwardRef have no Vue equivalent: a component is the
// SFC file, and its default export is named by the file.
