// Components outside the ui directory whose class lands on a
// design-system component: styling <SaveButton> styles the Button inside
// it, so the wrapper inherits its target's contract and variants. In a
// Vue component the class travels two ways: attribute fallthrough puts
// it on the template's root element, and an explicit `v-bind="$attrs"`
// or `:class="props.class"` puts it where the author says. The one
// cross-file fact the boundary needs — a contract that follows the
// value, the way a type would. See docs/how-it-works.md.

import { child, flag, list, text, walk, type Node } from "./ast"
import {
  componentFromImport,
  importNameOf,
  type ComponentImport,
} from "./component-imports"
import { componentsFor } from "./components"
import { mtimeOf, NODE_MODULES, TTL } from "./fs"
import { definingExportOf } from "./modules"
import { sfcComponentName, sfcOf } from "./sfc"

export type WrapperTarget = {
  component: string
  file: string | null
}

// For the file being linted, the AST the linter already parsed instead
// of a second read from disk.
export type ParsedSfc = {
  program: Node
  template: Node | null
}

type FileWrappers = Map<string, WrapperTarget | null>

type Entry = {
  deps: string[]
  signature: string
  checkedAt: number
  wrappers: FileWrappers
}

const cache = new Map<string, Entry>()

function signatureOf(files: string[]) {
  return files.map((file) => `${file}:${mtimeOf(file) ?? "missing"}`).join("|")
}

// The template elements in document order.
function elementsOf(root: Node): Node[] {
  const found: Node[] = []
  walk(root, (node) => {
    if (node.type === "VElement") found.push(node)
  })
  return found
}

function attributesOf(element: Node): Node[] {
  return list(child(element, "startTag"), "attributes")
}

// The name a v-bind directive's key carries: `bind`, `if`, `else`, and
// so on.
function directiveOf(attribute: Node): string | null {
  if (flag(attribute, "directive") !== true) return null
  return text(child(child(attribute, "key"), "name"), "name")
}

// The argument of a v-bind: `class` in `:class`, `style` in `:style`,
// null for a spread.
function bindArgumentOf(attribute: Node): string | null {
  if (directiveOf(attribute) !== "bind") return null
  return text(child(child(attribute, "key"), "argument"), "name")
}

function bindExpressionOf(attribute: Node): Node | null {
  return child(child(attribute, "value"), "expression")
}

// True when the expression hands the component's received class along:
// a member read of `.class` on a passed-through name, or the local a
// destructured `class` prop binds.
function handsClass(
  expression: Node | null,
  passed: Set<string>,
  name: string
) {
  if (!expression) return false
  if (expression.type === "Identifier") {
    return passed.has(text(expression, "name") ?? "")
  }
  let found = false
  walk(expression, (node) => {
    if (found || node.type !== "MemberExpression") return
    const property = child(node, "property")
    const object = child(node, "object")
    if (text(property, "name") !== name || object?.type !== "Identifier") return
    const objectName = text(object, "name")
    if (objectName !== null && passed.has(objectName)) found = true
  })
  return found
}

// True when the element is where the wrapper's class lands: a spread of
// the received attrs, or a class binding that passes one of them on.
function receivesClass(element: Node, passed: Set<string>, attrs: Set<string>) {
  for (const attribute of attributesOf(element)) {
    if (flag(attribute, "directive") !== true) continue
    const argument = bindArgumentOf(attribute)
    if (argument === null) {
      const spread = text(bindExpressionOf(attribute), "name")
      if (spread !== null && attrs.has(spread)) return true
      continue
    }
    if (
      argument === "class" &&
      handsClass(bindExpressionOf(attribute), passed, "class")
    ) {
      return true
    }
  }
  return false
}

// The names that carry a received attribute into the template:
// `defineProps()` and `useAttrs()` receivers, the locals a destructured
// `class` prop binds, and the template's own `$attrs`.
function receiversOf(program: Node | null) {
  const passed = new Set<string>(["$attrs"])
  const attrs = new Set<string>(["$attrs"])
  if (!program) return { passed, attrs }
  walk(program, (node, parent) => {
    if (node.type !== "CallExpression") return
    const callee = child(node, "callee")
    if (callee?.type !== "Identifier") return
    const calleeName = text(callee, "name")
    const isProps = calleeName === "defineProps"
    const isAttrs = calleeName === "useAttrs"
    if (!isProps && !isAttrs) return
    const declarator = parent?.type === "VariableDeclarator" ? parent : null
    const id = child(declarator, "id")
    if (!id) return
    if (id.type === "Identifier") {
      const name = text(id, "name")
      if (name !== null) {
        passed.add(name)
        if (isAttrs) attrs.add(name)
      }
      return
    }
    if (id.type !== "ObjectPattern") return
    for (const property of list(id, "properties")) {
      if (property.type !== "Property") continue
      const key = child(property, "key")
      const keyName = text(key, "name") ?? text(key, "value")
      const value = child(property, "value")
      const local =
        value?.type === "AssignmentPattern" ? child(value, "left") : value
      const localName = text(local, "name")
      if (keyName === "class" && localName !== null) passed.add(localName)
    }
  })
  return { passed, attrs }
}

// `inheritAttrs: false` turns fallthrough off: in <script setup> through
// defineOptions, in an options component through the exported object.
function inheritAttrsOff(program: Node | null) {
  if (!program) return false
  let off = false
  walk(program, (node) => {
    if (off) return
    let object: Node | null = null
    if (node.type === "CallExpression") {
      const callee = child(node, "callee")
      if (
        callee?.type === "Identifier" &&
        text(callee, "name") === "defineOptions"
      ) {
        object = list(node, "arguments")[0] ?? null
      }
    } else if (node.type === "ExportDefaultDeclaration") {
      object = child(node, "declaration")
      if (object?.type === "CallExpression") {
        object = list(object, "arguments")[0] ?? null
      }
    }
    if (object?.type !== "ObjectExpression") return
    for (const property of list(object, "properties")) {
      if (property.type !== "Property") continue
      const key = child(property, "key")
      const keyName = text(key, "name") ?? text(key, "value")
      if (keyName !== "inheritAttrs") continue
      if (flag(child(property, "value"), "value") === false) off = true
    }
  })
  return off
}

function importTableOf(program: Node | null) {
  const imports = new Map<string, ComponentImport>()
  if (!program) return imports
  for (const statement of list(program, "body")) {
    if (statement.type !== "ImportDeclaration") continue
    const source = text(child(statement, "source"), "value")
    if (source === null) continue
    for (const spec of list(statement, "specifiers")) {
      const local = text(child(spec, "local"), "name")
      if (local === null) continue
      const imported = child(spec, "imported")
      const original =
        spec.type === "ImportSpecifier"
          ? (text(imported, "name") ?? text(imported, "value") ?? local)
          : spec.type === "ImportDefaultSpecifier"
            ? "default"
            : local
      imports.set(local, {
        source,
        original,
        namespace: spec.type === "ImportNamespaceSpecifier",
      })
    }
  }
  return imports
}

// The element children of the template root. A v-if / v-else chain
// renders exactly one of its branches, so a full chain is one root slot
// for fallthrough; anything else with several children has none.
function rootSlotsOf(template: Node): Node[][] {
  const children = list(template, "children").filter(
    (node) => node.type === "VElement"
  )
  if (children.length <= 1) return children.map((child) => [child])
  // A v-if / v-else chain renders exactly one of its branches, so the
  // chain is one root slot; several independent roots are a fragment,
  // which Vue falls nothing through to.
  const chain: Node[][] = []
  let current: Node[] | null = null
  for (const child of children) {
    const branches = new Set(
      attributesOf(child)
        .map((attribute) => directiveOf(attribute))
        .filter((name): name is string => name !== null)
    )
    if (branches.has("if")) {
      current = [child]
      chain.push(current)
    } else if (current && (branches.has("else-if") || branches.has("else"))) {
      current.push(child)
    } else {
      return []
    }
  }
  return chain
}

// `visiting` holds the files on the current path so a wrapper cycle
// terminates; a map computed while a cycle was cut is never cached, so no
// caller sees a truncated answer later.
function build(
  file: string,
  patterns: RegExp[],
  visiting: Set<string>,
  deps: Set<string>,
  parsed?: ParsedSfc
): { wrappers: FileWrappers; complete: boolean } {
  const wrappers: FileWrappers = new Map()
  let complete = true
  deps.add(file)
  const sfc = parsed ?? sfcOf(file)
  const template = sfc?.template ?? null
  if (!template) {
    // Only a Vue component can be a wrapper; a .ts barrel re-export is
    // never one.
    return { wrappers, complete: Boolean(sfc || !/\.vue$/i.test(file)) }
  }
  const imports = importTableOf(sfc?.program ?? null)
  const { passed, attrs } = receiversOf(sfc?.program ?? null)
  const fallthrough = !inheritAttrsOff(sfc?.program ?? null)
  const index = componentsFor(file)

  const targetOfTag = (rawName: string): WrapperTarget | null => {
    if (!rawName) return null
    // A lowercase single word is a native element; a hyphenated tag is
    // the component its PascalCase name imports.
    const pascal = rawName.includes("-")
      ? rawName
          .split("-")
          .map((part) =>
            part ? part.charAt(0).toUpperCase() + part.slice(1) : part
          )
          .join("")
      : rawName
    for (const name of rawName === pascal ? [rawName] : [rawName, pascal]) {
      const imported = imports.get(name)
      if (!imported) {
        // Unimported: only a ui component of the project answers to the
        // name.
        if (index.has(name)) {
          return {
            component: name,
            file: index.files.get(name) ?? null,
          }
        }
        continue
      }
      const importedName = importNameOf(imported, name, null)
      const binding = definingExportOf(
        imported.source,
        imported.original,
        file,
        deps
      )
      const component = componentFromImport(
        index,
        binding,
        importedName,
        patterns
      )
      if (component) return component
      if (!binding) {
        // Not cached: the file the name points at may yet be created.
        complete = false
        return index.has(importedName.name)
          ? {
              component: importedName.name,
              file: index.files.get(importedName.name) ?? null,
            }
          : null
      }
      // Packages are never wrappers of the project's own system.
      if (binding.file === file || NODE_MODULES.test(binding.file)) return null
      if (visiting.has(binding.file)) {
        complete = false
        return null
      }
      const result = lookup(
        binding.file,
        binding.name,
        patterns,
        visiting,
        deps
      )
      if (!result.complete) complete = false
      return result.target
    }
    return null
  }

  // The root first — fallthrough puts the class there without a
  // forwarding line — then every element that passes the class on by
  // hand. First match in document order supplies the contract.
  let target: WrapperTarget | null = null
  outer: for (const slot of rootSlotsOf(template)) {
    const roots = slot.filter((element) => directiveOf(element) !== "slot")
    if (!roots.length) continue
    if (roots.length === 1) {
      if (fallthrough) {
        target = targetOfTag(text(roots[0], "rawName") ?? "")
        if (target) break outer
      }
      continue
    }
    // Every branch must agree, or the class could land on any of
    // several components.
    let agreed: WrapperTarget | null | undefined
    for (const root of roots) {
      const branch = targetOfTag(text(root, "rawName") ?? "")
      if (agreed === undefined) agreed = branch
      else if (agreed?.component !== branch?.component) {
        agreed = null
        break
      }
    }
    target = agreed ?? null
    if (target) break outer
  }
  if (!target) {
    for (const element of elementsOf(template)) {
      if (!receivesClass(element, passed, attrs)) continue
      target = targetOfTag(text(element, "rawName") ?? "")
      if (target) break
    }
  }
  wrappers.set("default", target)
  wrappers.set(sfcComponentName(file), target)
  return { wrappers, complete }
}

function lookup(
  file: string,
  exportName: string,
  patterns: RegExp[],
  visiting: Set<string>,
  deps: Set<string> | undefined,
  parsed?: ParsedSfc
): { target: WrapperTarget | null; complete: boolean } {
  deps?.add(file)
  if (mtimeOf(file) === null) return { target: null, complete: false }
  const key = `${file}|${patterns.map((p) => p.source).join(",")}`
  const cached = cache.get(key)
  const now = Date.now()
  if (
    cached &&
    (now - cached.checkedAt < TTL ||
      signatureOf(cached.deps) === cached.signature)
  ) {
    if (now - cached.checkedAt >= TTL) {
      cached.checkedAt = now
    }
    if (deps) {
      for (const dep of cached.deps) {
        deps.add(dep)
      }
    }
    return { target: cached.wrappers.get(exportName) ?? null, complete: true }
  }
  visiting.add(file)
  const own = new Set<string>()
  const { wrappers, complete } = build(file, patterns, visiting, own, parsed)
  visiting.delete(file)
  if (deps) {
    for (const dep of own) {
      deps.add(dep)
    }
  }
  const depList = [...own]
  if (complete) {
    cache.set(key, {
      deps: depList,
      signature: signatureOf(depList),
      checkedAt: now,
      wrappers,
    })
  }
  return { target: wrappers.get(exportName) ?? null, complete }
}

// For the file being linted, pass the AST the linter already parsed
// instead of re-reading it from disk.
export function wrapperTargetOf(
  file: string,
  exportName: string,
  patterns: RegExp[] = [],
  parsed?: ParsedSfc
): WrapperTarget | null {
  return lookup(file, exportName, patterns, new Set(), undefined, parsed).target
}

export function clearWrapperCache() {
  cache.clear()
}
