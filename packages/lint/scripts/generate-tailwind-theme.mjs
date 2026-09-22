// Regenerates src/grammar/tailwind-theme.ts from the tailwindcss package
// installed next to this file: the default palette and the font-size,
// radius and container scales, as the raw CSS values theme.css declares.
// The rules use them to name the nearest token for a raw color or an
// off-scale length. Run with: node scripts/generate-tailwind-theme.mjs
// test/generated.test.ts renders the same text and fails when the
// checked-in file is behind the installed Tailwind.

import * as fs from "node:fs"
import { createRequire } from "node:module"
import * as path from "node:path"
import { fileURLToPath } from "node:url"

const require = createRequire(import.meta.url)

export const TARGET = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../src/grammar/tailwind-theme.ts"
)

// The generated module's text for the installed tailwindcss.
export function render() {
  const pkg = require("tailwindcss/package.json")
  const css = fs.readFileSync(require.resolve("tailwindcss/theme.css"), "utf-8")

  const colors = {}
  const text = {}
  const radius = {}
  const container = {}
  let spacing = "0.25rem"

  for (const match of css.matchAll(/^\s*--([\w-]+):\s*([^;]+);/gm)) {
    const [, name, value] = match
    if (name.startsWith("color-")) colors[name.slice(6)] = value.trim()
    else if (name.startsWith("text-") && !name.includes("--"))
      text[name.slice(5)] = value.trim()
    else if (name.startsWith("radius-")) radius[name.slice(7)] = value.trim()
    else if (name.startsWith("container-"))
      container[name.slice(10)] = value.trim()
    else if (name === "spacing") spacing = value.trim()
  }

  const emit = (name, record) =>
    `export const ${name}: Record<string, string> = ${JSON.stringify(record, null, 2)}\n`

  return {
    version: pkg.version,
    counts: {
      colors: Object.keys(colors).length,
      text: Object.keys(text).length,
      radius: Object.keys(radius).length,
      container: Object.keys(container).length,
    },
    source: `// Generated from tailwindcss@${pkg.version} by scripts/generate-tailwind-theme.mjs.
// Do not edit by hand. The default palette and scales, as theme.css
// declares them, for naming the nearest token in a message.

export const TAILWIND_VERSION = ${JSON.stringify(pkg.version)}

export const SPACING = ${JSON.stringify(spacing)}

${emit("PALETTE", colors)}
${emit("FONT_SIZES", text)}
${emit("RADII", radius)}
${emit("CONTAINERS", container)}`,
  }
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const { source, counts } = render()
  fs.writeFileSync(TARGET, source)
  console.log(
    `wrote ${path.relative(process.cwd(), TARGET)}: ${counts.colors} colors, ${counts.text} font sizes, ${counts.radius} radii, ${counts.container} containers`
  )
}
