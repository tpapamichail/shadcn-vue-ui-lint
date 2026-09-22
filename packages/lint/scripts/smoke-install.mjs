// Packs @tpapamichail/shadcn-vue-lint the way `npm publish` would,
// installs the tarball into a fresh project outside the workspace, and
// lints that project with ESLint + vue-eslint-parser. Catches what unit
// tests cannot: the exports map, the ESM build and its worker, the
// optional oxc-parser, the copied README, and the messages users see.
// Run: node scripts/smoke-install.mjs

import { execSync, spawnSync } from "node:child_process"
import * as fs from "node:fs"
import * as os from "node:os"
import * as path from "node:path"
import { fileURLToPath } from "node:url"

const PKG = "@tpapamichail/shadcn-vue-lint"
const PKG_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "shadcn-vue-lint-smoke-"))
const run = (cmd, cwd = dir) =>
  execSync(cmd, { cwd, stdio: ["ignore", "pipe", "pipe"], encoding: "utf-8" })
const write = (file, text) => {
  fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true })
  fs.writeFileSync(path.join(dir, file), text)
}

let failures = 0
const expect = (label, out, needle) => {
  const ok = needle instanceof RegExp ? needle.test(out) : out.includes(needle)
  console.log(`${ok ? "ok  " : "FAIL"} ${label}`)
  if (!ok) {
    failures++
    console.log(
      out
        .split("\n")
        .slice(0, 40)
        .map((l) => "     " + l)
        .join("\n")
    )
  }
}

try {
  // 1. Pack.
  const packOut = run(
    `pnpm pack --pack-destination ${JSON.stringify(dir)}`,
    PKG_DIR
  )
  const tarball = packOut.trim().split("\n").pop()
  const listing = run(`tar -tzf ${JSON.stringify(tarball)}`)
  expect("tarball has the ESM build", listing, "package/dist/index.js")
  expect(
    "tarball has the Tailwind worker",
    listing,
    "package/dist/tailwind-worker.js"
  )
  expect(
    "tarball has no CommonJS build",
    listing,
    /^(?![\s\S]*package\/dist\/[^\n]*\.cjs\n)/
  )
  expect("tarball has README.md", listing, "package/README.md")
  expect(
    "tarball has no source or scripts",
    listing,
    /^(?![\s\S]*package\/(src|scripts|test)\/)/
  )

  // 2. A small shadcn-vue-shaped project.
  write(
    "package.json",
    JSON.stringify({ name: "smoke", private: true, type: "module" }, null, 2)
  )
  write(
    "components.json",
    JSON.stringify({
      aliases: { components: "@/components", ui: "@/components/ui" },
      tailwind: { css: "app/globals.css" },
    })
  )
  write(
    "tsconfig.json",
    JSON.stringify({
      compilerOptions: {
        baseUrl: ".",
        paths: { "@/*": ["./*"] },
      },
    })
  )
  write(
    "app/globals.css",
    `@import "tailwindcss";\n@theme inline {\n  --color-primary: var(--primary);\n  --color-muted: var(--muted);\n  --color-muted-foreground: var(--muted-foreground);\n  --radius-lg: var(--radius);\n}\n:root {\n  --radius: 0.625rem;\n  --primary: oklch(0.205 0 0);\n  --muted: oklch(0.97 0 0);\n  --muted-foreground: oklch(0.556 0 0);\n}\n`
  )
  write(
    "components/ui/button/index.ts",
    `export { default as Button } from "./Button.vue"\n`
  )
  write(
    "components/ui/button/Button.vue",
    `<script setup lang="ts">
import { cva } from "class-variance-authority"
import { cn } from "@/lib/utils"

const buttonVariants = cva("inline-flex", {
  variants: { variant: { default: "bg-primary", ghost: "bg-transparent" } },
})

const props = defineProps<{ variant?: "default" | "ghost"; class?: string }>()
</script>

<template>
  <button :class="cn(buttonVariants({ variant: props.variant }), props.class)" />
</template>
`
  )
  write(
    "components/SaveButton.vue",
    `<script setup lang="ts">
import { Button } from "@/components/ui/button"

const props = defineProps<{ class?: string }>()
</script>

<template>
  <Button :class="props.class">Save</Button>
</template>
`
  )
  write(
    "app/page.vue",
    `<script setup lang="ts">
import { Button } from "@/components/ui/button"
import SaveButton from "@/components/SaveButton.vue"
</script>

<template>
  <div class="bg-zinc-100 rounded-[10px] text-primry flex-cols hovr:flex">
    <Button class="bg-pink-500 mt-4">Go</Button>
    <SaveButton class="rounded-full" />
  </div>
</template>
`
  )
  write(
    "eslint.config.mjs",
    `import { plugin as shadcnVue } from "${PKG}"
import vueParser from "vue-eslint-parser"
import tsParser from "@typescript-eslint/parser"
export default [
  {
    files: ["**/*.vue"],
    languageOptions: {
      parser: vueParser,
      parserOptions: { parser: tsParser, sourceType: "module" },
    },
    plugins: { "shadcn-vue": shadcnVue },
    rules: {
      "shadcn-vue/no-restyle": ["error", { allow: ["layout"] }],
      "shadcn-vue/no-raw-colors": "error",
      "shadcn-vue/no-arbitrary-values": "error",
      "shadcn-vue/no-inline-styles": "error",
      "shadcn-vue/require-static-classes": "error",
      "shadcn-vue/no-unknown-classes": "error",
    },
  },
  {
    files: ["components/ui/**"],
    rules: {
      "shadcn-vue/no-restyle": "off",
      "shadcn-vue/require-static-classes": "off",
      "shadcn-vue/no-arbitrary-values": "off",
    },
  },
]
`
  )

  // 3. Install from the tarball, plus ESLint and the parsers.
  run(
    `pnpm add -D --ignore-workspace ${JSON.stringify(tarball)} eslint@9 vue-eslint-parser @typescript-eslint/parser tailwindcss@4`
  )
  const installed = JSON.parse(
    fs.readFileSync(
      path.join(dir, `node_modules/${PKG}/package.json`),
      "utf-8"
    )
  )
  // The optional parser must resolve from the installed package itself.
  const probe = spawnSync(
    process.execPath,
    [
      "-e",
      `const { createRequire } = require("node:module"); const r = createRequire(require.resolve("${PKG}", { paths: [process.cwd()] })); try { r("oxc-parser"); console.log("oxc") } catch (e) { console.log("none: " + e.message) }`,
    ],
    { cwd: dir, encoding: "utf-8" }
  )
  expect(
    `installed ${PKG}@${installed.version}; oxc-parser resolves from it`,
    probe.stdout + probe.stderr,
    /^oxc/
  )

  // 4. ESLint.
  const eslint = spawnSync("npx", ["eslint", "app/page.vue"], {
    cwd: dir,
    encoding: "utf-8",
    // npx is a .cmd shim on Windows and needs a shell there.
    shell: process.platform === "win32",
  })
  const eout = eslint.stdout + eslint.stderr
  expect(
    "eslint: boundary on Button lists variants",
    eout,
    /"bg-pink-500" is not allowed on <Button>: <Button> owns its color\. Use a variant: default, ghost\. Add a new variant in components\/ui\/button\/Button\.vue/
  )
  expect(
    "eslint: boundary through the wrapper",
    eout,
    /"rounded-full" is not allowed on <SaveButton>: <SaveButton> passes its class to <Button>, which owns its shape/
  )
  expect(
    "eslint: nearest token for a palette class",
    eout,
    /"bg-zinc-100" uses the raw Tailwind palette\. Nearest theme tokens: bg-muted\./
  )
  expect(
    "eslint: typo",
    eout,
    /"text-primry" is not a declared theme color\. Did you mean "text-primary"\?/
  )
  expect(
    "eslint: radius from the theme",
    eout,
    /"rounded-\[10px\]" hardcodes an off-token value\. Use "rounded-lg" instead/
  )
  expect("eslint: layout on Button passes", eout, /^(?![\s\S]*"mt-4")/)
  expect(
    "eslint: the project's Tailwind names the typo",
    eout,
    /"flex-cols" is not a class this project's Tailwind knows, so no CSS is generated for it\. Did you mean "flex-col"\?/
  )
  expect(
    "eslint: an invented variant",
    eout,
    /"hovr:flex" is not a class[\s\S]*Did you mean "hover:flex"\?/
  )
  expect(
    "eslint: no fallback warning",
    eout,
    /^(?![\s\S]*could not be consulted)/
  )
} finally {
  fs.rmSync(dir, { recursive: true, force: true })
}

if (failures) {
  console.log(`\n${failures} check(s) failed`)
  process.exit(1)
}
console.log("\nsmoke install passed")