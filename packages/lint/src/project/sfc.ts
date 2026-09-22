// A Vue single-file component split into its script and its template,
// for every analysis that reads a component file without ESLint's
// traversal: variants and wrapper targets. vue-eslint-parser does the
// splitting; the script block is delegated to the same parsers the rest
// of the project uses, so a run that reads no .vue file loads nothing
// new.

import { createRequire } from "node:module"
import * as fs from "node:fs"
import * as path from "node:path"

import { child, type Node } from "./ast"
import { mtimeOf } from "./fs"
import { parseClassSelectors } from "./theme"
import { warnOnce } from "./warn"

const require = createRequire(import.meta.url)

export type Sfc = {
  // The script-setup block when there is one, else the plain script.
  program: Node | null
  template: Node | null
}

type ScriptParser = {
  parse: (code: string, options: object) => Node
  parseForESLint?: (code: string, options: object) => { ast: Node }
}

// vue-eslint-parser delegates <script> blocks to a parser object; oxc's
// bare program is not enough for it (it reads the parse result's own
// fields), so the TypeScript parser is the one wired here. Without it,
// vue-eslint-parser falls back to espree, which reads a plain script
// but not a TypeScript one.
function typescriptScriptParser(): ScriptParser | null {
  try {
    const ts = require("@typescript-eslint/parser") as ScriptParser
    return {
      parse: (code) => ts.parse(code, { jsx: false, range: false, loc: false }),
      parseForESLint: (code, options) =>
        ts.parseForESLint?.(code, options) ??
        { ast: ts.parse(code, { jsx: false, range: false, loc: false }) },
    }
  } catch {
    return null
  }
}

type VueParser = {
  parseForESLint: (code: string, options: object) => { ast: Node }
}

let vueParser: VueParser | null = null

function vueParserOf(): VueParser {
  if (!vueParser) vueParser = require("vue-eslint-parser") as VueParser
  return vueParser
}

// Parses the SFC `source` of `file`. Null when the file is not an SFC
// or cannot be parsed, the way a throwing parser leaves callers to
// degrade quietly.
export function parseSfc(source: string, file: string): Sfc | null {
  const scriptParser = typescriptScriptParser()
  if (!scriptParser) {
    warnOnce(
      "sfc-parser:none",
      "@typescript-eslint/parser is not installed, so a TypeScript Vue component file cannot be read: variants and wrappers are unknown until it is."
    )
  }
  try {
    const parsed = vueParserOf().parseForESLint(source, {
      filePath: file,
      sourceType: "module",
      ...(scriptParser ? { parser: scriptParser } : {}),
      ecmaFeatures: { jsx: false },
    })
    return {
      program: parsed.ast ?? null,
      template: parsed.ast ? child(parsed.ast, "templateBody") : null,
    }
  } catch {
    return null
  }
}

const cache = new Map<string, { mtimeMs: number; sfc: Sfc | null }>()

// The Sfc of a file on disk, fresh as its mtime.
export function sfcOf(file: string): Sfc | null {
  const mtimeMs = mtimeOf(file)
  if (mtimeMs === null) return null
  const cached = cache.get(file)
  if (cached && cached.mtimeMs === mtimeMs) return cached.sfc
  let sfc: Sfc | null = null
  try {
    sfc = parseSfc(fs.readFileSync(file, "utf-8"), file)
  } catch {
    sfc = null
  }
  cache.set(file, { mtimeMs, sfc })
  return sfc
}

// The name a .vue file's implicit default export goes by: Button.vue is
// the component Button, my-button.vue is MyButton — the same derivation
// Vue tooling makes from the filename.
export function sfcComponentName(file: string) {
  const stem = path.basename(file, path.extname(file))
  return stem
    .split(/[-_]/)
    .map((part) => (part ? part.charAt(0).toUpperCase() + part.slice(1) : part))
    .join("")
}

// A single-file component: its scripts are the module, its file the
// component.
export function isSfc(file: string) {
  return /\.vue$/i.test(file)
}

const STYLE_RE = /<style\b[^>]*>([\s\S]*?)<\/style\s*>/gi

// The classes an SFC's own <style> blocks select.
export function styleClassesOf(source: string) {
  const out = new Set<string>()
  for (const match of source.matchAll(STYLE_RE)) {
    for (const name of parseClassSelectors(match[1])) out.add(name)
  }
  return out
}
