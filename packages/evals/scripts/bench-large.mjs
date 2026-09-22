import { createHash } from "node:crypto"
import * as fs from "node:fs"
import * as os from "node:os"
import * as path from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"
import parser from "@typescript-eslint/parser"
import { ESLint } from "eslint"

import { rulesAt } from "../lib/policy.mjs"

const { plugin } = await import(
  process.env.SHADCN_LINT_PLUGIN
    ? pathToFileURL(path.resolve(process.env.SHADCN_LINT_PLUGIN)).href
    : "@tpapamichail/shadcn-vue-lint"
)

function count(name, fallback) {
  const index = process.argv.indexOf(`--${name}`)
  const value = index === -1 ? fallback : Number(process.argv[index + 1])
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new Error(`--${name} must be a positive integer.`)
  }
  return value
}

const files = count("files", 1000)
const components = count("components", 250)
const runs = count("runs", 2)
const direct = process.argv.includes("--direct")
const wrappers = process.argv.includes("--wrappers")
const clean = process.argv.includes("--clean")
const root = fs.realpathSync.native(
  fs.mkdtempSync(path.join(os.tmpdir(), "lint-bench-"))
)

function write(name, source) {
  const file = path.join(root, name)
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, source)
}

try {
  write("package.json", JSON.stringify({ private: true, type: "module" }))
  write(
    "components.json",
    JSON.stringify({
      aliases: { ui: "@/components/ui" },
      tailwind: { css: "theme.css" },
    })
  )
  write(
    "theme.css",
    '@import "tailwindcss"; @theme { --color-primary: #123456; }'
  )
  fs.symlinkSync(
    fileURLToPath(new URL("../node_modules", import.meta.url)),
    path.join(root, "node_modules"),
    "junction"
  )
  const exports = []
  for (let i = 0; i < components; i++) {
    write(
      `components/ui/control-${i}.tsx`,
      `export function Control${i}(props) { return <button {...props} /> }`
    )
    exports.push(`export { Control${i} } from "./control-${i}"`)
  }
  write("components/ui/index.ts", exports.join("\n"))
  if (wrappers) {
    for (let i = 0; i < components; i++) {
      write(
        `components/control-${i}.tsx`,
        `import { Control${i} } from "@/components/ui"
export function Wrapped${i}(props) { return <Control${i} {...props} /> }`
      )
    }
  }
  for (let i = 0; i < files; i++) {
    const names = Array.from(
      { length: Math.min(8, components) },
      (_, j) => (i + j) % components
    )
    const prefix = wrappers ? "Wrapped" : "Control"
    const imports = wrappers
      ? names.map(
          (n) => `import { Wrapped${n} } from "@/components/control-${n}"`
        )
      : direct
        ? names.map(
            (n) => `import { Control${n} } from "@/components/ui/control-${n}"`
          )
        : [
            `import { ${names.map((n) => `Control${n}`).join(", ")} } from "@/components/ui"`,
          ]
    write(
      `src/features/feature-${i}/screens/page.tsx`,
      `${imports.join("\n")}
export function Page() {
  return <main className="flex flex-col gap-4">${names
    .map(
      (n) =>
        `<${prefix}${n} className="${clean ? "w-full" : "w-full bg-red-500 rounded-[13px]"}" />`
    )
    .join("")}</main>
}`
    )
  }

  console.log(
    JSON.stringify({
      files,
      components,
      imports: wrappers ? "wrappers" : direct ? "direct" : "barrel",
      clean,
    })
  )
  for (const enabled of [false, true]) {
    const eslint = new ESLint({
      cwd: root,
      overrideConfigFile: true,
      overrideConfig: [
        {
          files: ["**/*.tsx"],
          languageOptions: {
            parser,
            parserOptions: { ecmaFeatures: { jsx: true } },
          },
          plugins: { shadcn: plugin },
          rules: enabled ? rulesAt("error", Object.keys(plugin.rules)) : {},
        },
      ],
    })
    for (let run = 0; run < runs; run++) {
      globalThis.gc?.()
      const start = performance.now()
      const results = await eslint.lintFiles(["src/**/*.tsx"])
      const ms = performance.now() - start
      const diagnostics = results.map((result) => ({
        file: path.relative(root, result.filePath),
        messages: result.messages,
      }))
      const digest = createHash("sha256")
        .update(JSON.stringify(diagnostics).replaceAll(root, "<project>"))
        .digest("hex")
      globalThis.gc?.()
      const memory = process.memoryUsage()
      console.log(
        JSON.stringify({
          rules: enabled ? "all" : "parse-only",
          run: run + 1,
          ms: Math.round(ms),
          files: results.length,
          findings: results.reduce(
            (total, result) => total + result.messages.length,
            0
          ),
          rssMiB: Math.round(memory.rss / 1024 / 1024),
          heapMiB: Math.round(memory.heapUsed / 1024 / 1024),
          digest,
        })
      )
    }
  }
} finally {
  fs.rmSync(root, { recursive: true, force: true })
}
