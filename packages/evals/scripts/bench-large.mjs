import { createHash } from "node:crypto"
import * as fs from "node:fs"
import * as os from "node:os"
import * as path from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"
import { ESLint } from "eslint"

import { sfcLanguageOptions } from "../lib/lint.mjs"
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
      `components/ui/control-${i}.vue`,
      `<script setup lang="ts">
const props = defineProps<{ class?: string }>()
</script>

<template>
  <button :class="props.class"><slot /></button>
</template>
`
    )
    exports.push(`export { default as Control${i} } from "./control-${i}.vue"`)
  }
  write("components/ui/index.ts", exports.join("\n"))
  if (wrappers) {
    for (let i = 0; i < components; i++) {
      write(
        `components/wrapped-${i}.vue`,
        `<script setup lang="ts">
import Control${i} from "@/components/ui/control-${i}.vue"

const props = defineProps<{ class?: string }>()
</script>

<template>
  <Control${i} :class="props.class"><slot /></Control${i}>
</template>
`
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
          (n) => `import ${prefix}${n} from "@/components/wrapped-${n}.vue"`
        )
      : direct
        ? names.map(
            (n) =>
              `import ${prefix}${n} from "@/components/ui/control-${n}.vue"`
          )
        : [
            `import { ${names.map((n) => `Control${n}`).join(", ")} } from "@/components/ui"`,
          ]
    const tags = names
      .map(
        (n) =>
          `    <${prefix}${n} class="${clean ? "w-full" : "w-full bg-red-500 rounded-[13px]"}" />`
      )
      .join("\n")
    write(
      `src/features/feature-${i}/screens/page.vue`,
      `<script setup lang="ts">
${imports.join("\n")}
</script>

<template>
  <main class="flex flex-col gap-4">
${tags}
  </main>
</template>
`
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
          files: ["**/*.vue"],
          languageOptions: sfcLanguageOptions(),
          plugins: { "shadcn-vue": plugin },
          rules: enabled ? rulesAt("error", Object.keys(plugin.rules)) : {},
        },
      ],
    })
    for (let run = 0; run < runs; run++) {
      globalThis.gc?.()
      const start = performance.now()
      const results = await eslint.lintFiles(["src/**/*.vue"])
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
