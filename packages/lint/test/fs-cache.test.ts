import * as fs from "node:fs"
import * as os from "node:os"
import * as path from "node:path"
import { afterEach, expect, test, vi } from "vitest"

import { findUp, memoize, resetFsMemo } from "../src/project/fs"

vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof fs>()
  return { ...actual, existsSync: vi.fn(actual.existsSync) }
})

afterEach(() => {
  vi.clearAllMocks()
  vi.useRealTimers()
  resetFsMemo()
})

test("sibling lookups probe shared ancestors once and see new nearer files", () => {
  vi.useFakeTimers({ toFake: ["Date"] })
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "lint-find-up-"))
  try {
    const manifest = path.join(root, "package.json")
    const nested = path.join(root, "src", "package.json")
    fs.writeFileSync(manifest, "{}")
    fs.mkdirSync(path.join(root, "src"))
    const exists = vi.mocked(fs.existsSync)
    for (let i = 0; i < 100; i++) {
      expect(
        findUp(path.join(root, "src", `feature-${i}`), "package.json")
      ).toBe(manifest)
    }
    expect(
      exists.mock.calls.filter(([file]) => file === manifest)
    ).toHaveLength(1)
    expect(exists.mock.calls.filter(([file]) => file === nested)).toHaveLength(
      1
    )

    fs.writeFileSync(nested, "{}")
    vi.setSystemTime(Date.now() + 1500)
    expect(findUp(path.join(root, "src", "feature-0"), "package.json")).toBe(
      nested
    )
    fs.unlinkSync(nested)
    vi.setSystemTime(Date.now() + 1500)
    expect(findUp(path.join(root, "src", "feature-0"), "package.json")).toBe(
      manifest
    )
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test("filesystem memo evicts old entries and keeps recent cached misses", () => {
  vi.useFakeTimers({ toFake: ["Date"] })
  for (let i = 0; i < 50_001; i++) {
    memoize(`entry:${i}`, () => null)
  }
  const compute = vi.fn(() => "new")
  expect(memoize("entry:50000", compute)).toBeNull()
  expect(compute).not.toHaveBeenCalled()
  expect(memoize("entry:0", compute)).toBe("new")
  expect(compute).toHaveBeenCalledTimes(1)
  vi.setSystemTime(Date.now() + 1500)
  expect(memoize("entry:50000", compute)).toBe("new")
})
