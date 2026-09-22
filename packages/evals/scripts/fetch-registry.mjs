#!/usr/bin/env node
// Fetches the shadcn-vue registry the corpus scripts measure against:
// a sparse, blob-less clone of unovue/shadcn-vue pinned to the commit
// in scripts/registry.json. Pinning is what makes the baseline
// reproducible; bump the ref and the baseline together. The sparse
// set also carries the theme CSS, which the rules read to recognize
// declared tokens.
//
// Usage:
//   node scripts/fetch-registry.mjs          # ensure .registry/shadcn-vue is at the pinned ref
//   node scripts/fetch-registry.mjs --print  # print the registry directory
import { execFileSync } from "node:child_process"
import * as fs from "node:fs"
import * as path from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, "..")
const PIN = JSON.parse(
  fs.readFileSync(path.join(__dirname, "registry.json"), "utf-8")
)
const CLONE_DIR = path.join(ROOT, ".registry", "shadcn-vue")

const git = (args, cwd = CLONE_DIR) =>
  execFileSync("git", args, { cwd, stdio: ["ignore", "pipe", "inherit"] })
    .toString()
    .trim()

export function registryDirectory() {
  return path.join(CLONE_DIR, PIN.path)
}

export function ensureRegistry() {
  if (!fs.existsSync(path.join(CLONE_DIR, ".git"))) {
    fs.mkdirSync(path.dirname(CLONE_DIR), { recursive: true })
    execFileSync(
      "git",
      [
        "clone",
        "--filter=blob:none",
        "--no-checkout",
        "--quiet",
        PIN.repo,
        CLONE_DIR,
      ],
      { stdio: "inherit" }
    )
  }
  // Re-applied every run so a changed include list takes effect.
  git(["sparse-checkout", "set", "--no-cone", ...(PIN.include ?? [PIN.path])])
  // A --no-checkout clone is at the right HEAD but has no files, so the
  // target directory decides as much as the ref.
  if (
    !fs.existsSync(registryDirectory()) ||
    !git(["rev-parse", "HEAD"]).startsWith(PIN.ref)
  ) {
    try {
      git(["cat-file", "-e", `${PIN.ref}^{commit}`])
    } catch {
      git(["fetch", "--quiet", "origin", PIN.ref])
    }
    git(["checkout", "--quiet", "--force", "--detach", PIN.ref])
  }
  // The v4 app is a Nuxt site and ships no components.json, which the
  // linter's project discovery requires. Write the manifest the app is
  // shaped like; pinned here so the corpus stays reproducible.
  const manifest = path.join(CLONE_DIR, "apps", "v4", "components.json")
  if (!fs.existsSync(manifest)) {
    fs.mkdirSync(path.dirname(manifest), { recursive: true })
    fs.writeFileSync(
      manifest,
      JSON.stringify(
        {
          $schema: "https://shadcn-vue.com/schema.json",
          style: "new-york",
          tailwind: {
            config: "",
            css: "assets/css/main.css",
            baseColor: "neutral",
            cssVariables: true,
            prefix: "",
          },
          aliases: {
            components: "@/components",
            utils: "@/lib/utils",
            ui: "@/registry/new-york-v4/ui",
            lib: "@/lib",
            composables: "@/composables",
          },
          iconLibrary: "lucide",
        },
        null,
        2
      ) + "\n"
    )
  }
  return registryDirectory()
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const dir = ensureRegistry()
  if (process.argv.includes("--print")) console.log(dir)
  else console.log(`Registry at ${dir} (${PIN.ref.slice(0, 9)})`)
}
