import { defaultConfig } from "cn/config"
import { describe, expect, test } from "vitest"

import { categoryOf, GROUP_CATEGORY } from "../src/grammar/categories"

describe("GROUP_CATEGORY", () => {
  test("covers every class group of the grammar exactly", () => {
    // Every group in the cn this package bundles.
    const upstream = new Set(Object.keys(defaultConfig().classGroups))
    const table = new Set(Object.keys(GROUP_CATEGORY))
    const missing = [...upstream].filter((name) => !table.has(name))
    const extra = [...table].filter((name) => !upstream.has(name))
    expect({ missing, extra }).toEqual({ missing: [], extra: [] })
  })

  test.each([
    ["bg-color", "color"],
    ["text-color", "color"],
    ["font-size", "typography"],
    ["text-alignment", null],
    ["m", null],
    ["p", "spacing"],
    ["rounded", "shape"],
    ["shadow", "effects"],
    ["animate", "motion"],
    ["translate", null],
  ])("%s → %s", (group, category) => {
    expect(GROUP_CATEGORY[group]).toBe(category)
  })
})

describe("categoryOf", () => {
  test.each([
    ["bg-color", "color"],
    ["text-alignment", null],
    ["p", "spacing"],
    ["arbitrary..color", "color"],
    ["arbitrary..background-color", "color"],
    ["arbitrary..padding-top", "spacing"],
    ["arbitrary..gap", "spacing"],
    ["arbitrary..font-feature-settings", "typography"],
    ["arbitrary..border-radius", "shape"],
    ["arbitrary..box-shadow", "effects"],
    ["arbitrary..transition-property", "motion"],
    ["arbitrary..mask-type", null],
    // A property that paints, sizes a border, casts a shadow, or
    // animates is never layout, so a contract opening layout does not
    // open it.
    ["arbitrary..background", "color"],
    ["arbitrary..border-top-color", "color"],
    ["arbitrary..caret-color", "color"],
    ["arbitrary..accent-color", "color"],
    ["arbitrary..outline-color", "color"],
    ["arbitrary..--tw-shadow-color", "color"],
    ["arbitrary..--tw-gradient-from", "color"],
    ["arbitrary..border", "shape"],
    ["arbitrary..border-top", "shape"],
    ["arbitrary..border-inline-start-width", "shape"],
    ["arbitrary..border-top-left-radius", "shape"],
    ["arbitrary..text-shadow", "effects"],
    ["arbitrary..mix-blend-mode", "effects"],
    ["arbitrary..text-transform", "typography"],
    ["arbitrary..row-gap", "spacing"],
    ["arbitrary..animation-duration", "motion"],
    // Placement and masking follow layout, as documented.
    ["arbitrary..margin", null],
    ["arbitrary..inset", null],
    ["arbitrary..mask-image", null],
    ["not-a-group", null],
    [null, null],
  ])("%s → %s", (groupId, category) => {
    expect(categoryOf(groupId)).toBe(category)
  })
})
