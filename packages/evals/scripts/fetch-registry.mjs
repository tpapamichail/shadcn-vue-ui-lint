#!/usr/bin/env node
// Fetches the shadcn registry the corpus scripts measure against: a
// sparse, blob-less clone of shadcn-ui/ui pinned to the commit in
// scripts/registry.json. Pinning is what makes the baseline
// reproducible; bump the ref and the baseline together. The sparse
// set also carries components.json and the theme CSS, which the rules
// read to recognize components and declared tokens.
//
// Usage:
//   node scripts/fetch-registry.mjs          # ensure .registry/ui is at the pinned ref
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
const CLONE_DIR = path.join(ROOT, ".registry", "ui")

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
  if (!git(["rev-parse", "HEAD"]).startsWith(PIN.ref)) {
    try {
      git(["cat-file", "-e", `${PIN.ref}^{commit}`])
    } catch {
      git(["fetch", "--quiet", "origin", PIN.ref])
    }
    git(["checkout", "--quiet", "--detach", PIN.ref])
  }
  return registryDirectory()
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const dir = ensureRegistry()
  if (process.argv.includes("--print")) console.log(dir)
  else console.log(`Registry at ${dir} (${PIN.ref.slice(0, 9)})`)
}
