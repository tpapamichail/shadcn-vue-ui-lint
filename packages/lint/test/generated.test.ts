// The checked-in Tailwind tables must match the installed tailwindcss.
// A dependency bump without a regeneration fails here, before it can
// ship stale palette or scale values.

import * as fs from "node:fs"
import { expect, test } from "vitest"

// @ts-expect-error the generator is plain JavaScript.
import { render, TARGET } from "../scripts/generate-tailwind-theme.mjs"

test("src/grammar/tailwind-theme.ts is generated from the installed tailwindcss", async () => {
  const { source, version } = render()
  const checkedIn = fs.readFileSync(TARGET, "utf-8")
  // Prettier reformats the generated file; compare it formatted the
  // same way, through the values rather than the bytes.
  const prettier = await import("prettier")
  const options = (await prettier.resolveConfig(TARGET)) ?? {}
  const formatted = await prettier.format(source, {
    ...options,
    filepath: TARGET,
  })
  expect(checkedIn).toBe(formatted)
  expect(checkedIn).toContain(`tailwindcss@${version}`)
})
