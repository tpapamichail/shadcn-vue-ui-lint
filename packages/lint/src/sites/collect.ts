// Finds every place a class string enters a Vue component and resolves
// each to the component it belongs to. Tailwind only generates CSS for
// class text present in source, so text plus one hop covers every class
// that can render; what the hop cannot read is reported as dynamic,
// never treated as empty. See docs/how-it-works.md.
//
// Templates and script are two trees: vue-eslint-parser traverses the
// script with ESLint and hands the template to defineTemplateBodyVisitor,
// which runs after the script — imports are collected before any
// template site resolves.

import { walk } from "../project/ast"
import {
  componentFromImport,
  importNameOf,
  type ComponentImport,
} from "../project/component-imports"
import { componentsFor } from "../project/components"
import { NODE_MODULES } from "../project/fs"
import { definingExportOf, type ExportBinding } from "../project/modules"
import { isSfc } from "../project/sfc"
import { warnOnce } from "../project/warn"
import { wrapperTargetOf, type WrapperTarget } from "../project/wrappers"
import { fileOf } from "../rules/messages"
import { withSettings } from "../rules/settings"

export type ClassString = {
  value: string
  node: any
}

export type ClassSite = {
  contextualStrings: ClassString[]
  // A referenced helper call owns its vocabulary check at its own site.
  vocabularyStrings: ClassString[]
  // What the collector could not read. A received class prop is
  // accepted; an unreadable authored default is not.
  unresolved: any[]
  component: string | null
  componentFile: string | null
  wrapper: string | null
  attribute: string | null
  node: any
  // The nearest enclosing element that passes `accepts`, and whether it
  // is the direct parent: where a spacing finding sends the class.
  enclosingContainer: (
    accepts: (component: string) => boolean
  ) => { name: string; direct: boolean } | null
  // A direct parent that fails `accepts`: never send spacing there.
  closedParent: (accepts: (component: string) => boolean) => string | null
}

export const DEFAULT_MERGE_FUNCTIONS = [
  "cn",
  "cx",
  "clsx",
  "cva",
  "tv",
  "twMerge",
  "twJoin",
  "classNames",
]

// Object arguments carry classes as values (cva), not keys (clsx).
export const DEFAULT_VARIANT_FUNCTIONS = ["cva", "tv"]

// Script bindings whose value is the classes they wrap: a computed's
// callback returns the value, a ref holds it.
const VUE_VALUE_FUNCTIONS = new Set(["computed", "ref", "shallowRef"])

const CLASS_ATTRIBUTE = /^[^:]*class(name)?s?$/i

export function isClassAttribute(name: string) {
  return CLASS_ATTRIBUTE.test(name)
}

// The name a class check sees: a static attribute's own name, or the
// argument of a v-bind. A spread (`v-bind="obj"`) names nothing.
export function attributeNameOf(attribute: any) {
  if (!attribute?.directive) {
    return typeof attribute?.key?.name === "string" ? attribute.key.name : ""
  }
  const key = attribute.key
  if (key?.name?.name !== "bind") return ""
  return typeof key.argument?.name === "string" ? key.argument.name : ""
}

export type TrackerOptions = {
  componentImports?: string[]
  // Left alone even when the name matches: a raw reka-ui primitive
  // imported next to its shadcn wrapper.
  ignoreImports?: string[]
}

// `<button-cta>` resolves like `<ButtonCta>`: the same import, the way
// Vue resolves a hyphenated tag. A lowercase single word is a native
// element, never the component its capitalized form names.
export function pascalOf(name: string) {
  return name
    .split("-")
    .map((part) => (part ? part.charAt(0).toUpperCase() + part.slice(1) : part))
    .join("")
}

function tagNamesOf(rawName: string) {
  if (!rawName.includes("-")) return [rawName]
  const pascal = pascalOf(rawName)
  return rawName === pascal ? [rawName] : [rawName, pascal]
}

export type ResolvedElement = {
  component: string
  file: string | null
  wrapper: string | null
}

const regexps = new Map<string, RegExp>()

function regexpOf(pattern: string) {
  let re = regexps.get(pattern)
  if (!re) {
    re = new RegExp(pattern)
    regexps.set(pattern, re)
  }
  return re
}

// The script-setup Program the template's identifiers read from.
function moduleScopeOf(context: any) {
  const scopes = context.sourceCode?.scopeManager?.scopes
  return (
    scopes?.find((scope: any) => scope.type === "module") ??
    context.sourceCode?.scopeManager?.globalScope ??
    null
  )
}

const templateContexts = new WeakMap<object, any>()

// Template expressions are parsed outside the script's traversal, so
// ESLint's getScope cannot see them. A template identifier reads the
// script-setup scope; the shim is handed only to the value readers.
function templateContextOf(context: any) {
  const cached = templateContexts.get(context)
  if (cached) return cached
  const shim = {
    sourceCode: {
      getScope: () => moduleScopeOf(context),
      ast: context.sourceCode?.ast,
    },
    settings: context.settings,
    options: context.options,
  }
  templateContexts.set(context, shim)
  return shim
}

// The same shim, for a rule that reads template expressions without the
// class-site layer.
export function templateContextFor(context: any) {
  return templateContextOf(context)
}

export function createComponentTracker(
  context: any,
  options: TrackerOptions = {}
) {
  const filename = fileOf(context)
  const index = componentsFor(filename)
  const patterns = (options.componentImports ?? []).map(regexpOf)
  const ignored = (options.ignoreImports ?? []).map(regexpOf)
  const imports = new Map<string, ComponentImport>()
  const skipped = new Set<string>()
  const bindings = new Map<string, ExportBinding | null>()
  const wrappers = new Map<string, WrapperTarget | null>()

  const bindingOf = (root: string, name: string) => {
    const key = `${root}:${name}`
    const cached = bindings.get(key)
    if (cached !== undefined) return cached
    const source = imports.get(root)?.source
    const binding =
      source && filename ? definingExportOf(source, name, filename) : null
    bindings.set(key, binding)
    return binding
  }

  // Packages are never wrappers of the project's own system.
  const wrapperOf = (root: string, binding: ExportBinding | null) => {
    const cached = wrappers.get(root)
    if (cached !== undefined) return cached
    let target: WrapperTarget | null = null
    if (
      binding &&
      binding.file !== filename &&
      !NODE_MODULES.test(binding.file)
    ) {
      // Another file's template: the AST in hand belongs to the file
      // under lint, so the wrapper is read from disk.
      target = wrapperTargetOf(binding.file, binding.name, patterns)
    }
    wrappers.set(root, target)
    return target
  }

  // Resolution first, name second: an import into the ui directory is
  // that component whatever it was renamed to, and one into a package is
  // not, however familiar. Only an unresolvable import falls back to the
  // name, so a broken alias degrades rather than going silent.
  const resolve = (rawName: string): ResolvedElement | null => {
    if (!rawName) return null
    for (const name of tagNamesOf(rawName)) {
      if (skipped.has(name)) continue
      const imported = imports.get(name)
      if (imported) {
        const importedName = importNameOf(imported, name, null)
        const binding = bindingOf(name, imported.original)
        const component = componentFromImport(
          index,
          binding,
          importedName,
          patterns
        )
        if (component) return { ...component, wrapper: null }
        if (binding) {
          if (NODE_MODULES.test(binding.file)) return null
          const target = wrapperOf(name, binding)
          if (!target) return null
          return {
            component: target.component,
            file: target.file,
            wrapper: name,
          }
        }
        if (index.has(name) || index.has(imported.original)) {
          return {
            component: name,
            file:
              index.files.get(name) ??
              index.files.get(imported.original) ??
              null,
            wrapper: null,
          }
        }
        continue
      }
      // Not imported: a ui component of the project answers to the name.
      if (index.has(name)) {
        return {
          component: name,
          file: index.files.get(name) ?? null,
          wrapper: null,
        }
      }
    }
    return null
  }

  return {
    collectImport(node: any) {
      const source = node.source?.value
      if (typeof source !== "string") return
      const matchesIgnore = ignored.some((p) => p.test(source))
      for (const spec of node.specifiers ?? []) {
        const local = spec.local?.name
        if (!local) continue
        const original =
          spec.type === "ImportSpecifier"
            ? (spec.imported?.name ?? spec.imported?.value ?? local)
            : spec.type === "ImportDefaultSpecifier"
              ? "default"
              : local
        imports.set(local, {
          source,
          original,
          namespace: spec.type === "ImportNamespaceSpecifier",
        })
        if (matchesIgnore) skipped.add(local)
      }
    },
    resolve,
  }
}

function findVariable(scope: any, name: string) {
  for (let s = scope; s; s = s.upper) {
    const variable = s.set?.get(name)
    if (variable) return variable
  }
  return null
}

function variableOf(node: any, context: any) {
  const scope = context.sourceCode?.getScope?.(node)
  return scope ? findVariable(scope, node.name) : null
}

function referenceExpression(node: any) {
  while (
    node.parent?.expression === node &&
    ["TSAsExpression", "TSNonNullExpression", "TSSatisfiesExpression"].includes(
      node.parent.type
    )
  ) {
    node = node.parent
  }
  return node
}

// A const binding keeps the reference, not the contents, so a property
// write through it makes later reads unreadable.
function isMutated(variable: any) {
  return (variable.references ?? []).some((ref: any) => {
    const id = referenceExpression(ref.identifier)
    const parent = id?.parent
    if (parent?.type === "MemberExpression" && parent.object === id) {
      let member = referenceExpression(parent)
      while (
        member.parent?.type === "MemberExpression" &&
        member.parent.object === member
      ) {
        member = referenceExpression(member.parent)
      }
      while (
        (member.parent?.type === "Property" &&
          member.parent.value === member &&
          member.parent.parent?.type === "ObjectPattern") ||
        member.parent?.type === "ArrayPattern" ||
        (member.parent?.type === "RestElement" &&
          member.parent.argument === member) ||
        (member.parent?.type === "AssignmentPattern" &&
          member.parent.left === member)
      ) {
        member =
          member.parent.type === "Property"
            ? member.parent.parent
            : member.parent
      }
      const outer = member.parent
      return (
        (outer?.type === "AssignmentExpression" && outer.left === member) ||
        outer?.type === "UpdateExpression" ||
        (outer?.type === "UnaryExpression" && outer.operator === "delete")
      )
    }
    return (
      parent?.type === "CallExpression" &&
      parent.callee?.type === "MemberExpression" &&
      parent.callee.object?.name === "Object" &&
      parent.callee.property?.name === "assign" &&
      parent.arguments?.[0] === id
    )
  })
}

const helperNames = new WeakMap<object, string[]>()

function helperNamesOf(context: any) {
  let names = helperNames.get(context)
  if (!names) {
    const options = withSettings(context, context.options?.[0] ?? {}) as {
      mergeFunctions?: string[]
      variantFunctions?: string[]
    }
    names = [
      ...DEFAULT_MERGE_FUNCTIONS,
      ...(options.mergeFunctions ?? []),
      ...(options.variantFunctions ?? []),
    ]
    helperNames.set(context, names)
  }
  return names
}

// An object handed to another owner can be changed through it. Reading a
// member or spreading does not hand over the object itself.
function isEscaped(variable: any, context?: any) {
  return (variable.references ?? []).some((ref: any) => {
    if (!ref.isRead?.()) return false
    let value = referenceExpression(ref.identifier)
    let parent = value.parent
    while (
      (parent?.type === "ConditionalExpression" && parent.test !== value) ||
      parent?.type === "LogicalExpression" ||
      (parent?.type === "SequenceExpression" &&
        parent.expressions.at(-1) === value)
    ) {
      value = referenceExpression(parent)
      parent = value.parent
    }
    // Reading the contents at a styling site hands nothing over.
    if (context) {
      const container =
        parent?.type === "VExpressionContainer" ? parent.parent : null
      if (
        container?.type === "VAttribute" &&
        (attributeNameOf(container) === "style" ||
          isClassAttribute(attributeNameOf(container)))
      )
        return false
      // A helper reads its arguments and never keeps them, directly or
      // inside a config literal.
      let inner = value
      let outer = parent
      while (
        outer?.type === "Property" &&
        outer.value === inner &&
        outer.parent?.type === "ObjectExpression"
      ) {
        inner = outer.parent
        outer = inner.parent
      }
      if (
        outer?.type === "CallExpression" &&
        outer.arguments.includes(inner) &&
        outer.callee.type === "Identifier" &&
        helperNamesOf(context).includes(outer.callee.name)
      )
        return false
    }
    return (
      (parent?.type === "VariableDeclarator" &&
        parent.id.type === "Identifier" &&
        parent.init === value) ||
      (parent?.type === "AssignmentExpression" &&
        ["Identifier", "MemberExpression"].includes(parent.left.type) &&
        parent.right === value) ||
      ((parent?.type === "CallExpression" ||
        parent?.type === "NewExpression") &&
        parent.arguments.includes(value)) ||
      (parent?.type === "ReturnStatement" && parent.argument === value) ||
      (parent?.type === "ArrowFunctionExpression" && parent.body === value) ||
      (parent?.type === "Property" &&
        parent.value === value &&
        parent.parent?.type === "ObjectExpression") ||
      parent?.type === "ArrayExpression" ||
      (parent?.type === "VExpressionContainer" &&
        parent.parent?.type === "VAttribute")
    )
  })
}

function isWritten(variable: any) {
  return (
    variable.references?.some((ref: any) => ref.isWrite?.() && !ref.init) ||
    isMutated(variable)
  )
}

// The slot a destructured binding reads from its initializer: `cls` in
// `const [dot, text, cls] = init` is element 2, `colorCls` in
// `const { Icon, colorCls } = init` is that property.
export type PatternStep = { index: number } | { key: string }

// The steps from a binding up to its declarator's pattern, outermost
// first. Null for a rest or a default, whose value no one slot holds.
function patternStepsOf(binding: any, pattern: any) {
  const steps: PatternStep[] = []
  let node = binding
  while (node !== pattern) {
    const parent = node?.parent
    if (parent?.type === "ArrayPattern") {
      steps.unshift({ index: parent.elements.indexOf(node) })
      node = parent
    } else if (
      parent?.type === "Property" &&
      parent.value === node &&
      parent.parent?.type === "ObjectPattern"
    ) {
      const key = keyName(parent)
      if (key === null) return null
      steps.unshift({ key })
      node = parent.parent
    } else {
      return null
    }
  }
  return steps
}

// Follows the steps into a literal initializer as far as the shape is
// plain: an array without a spread before the slot, an object without
// spreads. What remains is for the reader to follow through branches.
function projectStatic(init: any, steps: PatternStep[]) {
  let node = init
  let i = 0
  for (; i < steps.length; i++) {
    const value = unwrapTs(node)
    const step = steps[i]
    if ("index" in step && value?.type === "ArrayExpression") {
      const before = value.elements.slice(0, step.index + 1)
      if (before.some((el: any) => el?.type === "SpreadElement")) break
      const element = value.elements[step.index]
      if (!element) break
      node = element
    } else if ("key" in step && value?.type === "ObjectExpression") {
      if (value.properties.some((p: any) => p.type !== "Property")) break
      const found = value.properties.filter((p: any) => keyName(p) === step.key)
      if (!found.length) break
      node = found[found.length - 1].value
    } else break
  }
  return { init: node, steps: steps.slice(i) }
}

// One hop to a same-file const's initializer. `path` holds the variables
// on the current route, so a self-reference stops while the same variable
// read from both branches of a ternary resolves twice. A destructured
// binding gets its own slot of the initializer, and any steps a reader
// still has to follow through a conditional.
export function resolveIdentifier(node: any, context: any, path: Set<any>) {
  const variable = variableOf(node, context)
  if (!variable || path.has(variable)) return null
  const def = variable.defs?.[0]
  if (!def || def.type !== "Variable" || !def.node?.init) return null
  if (isWritten(variable)) return null
  let init = def.node.init
  let steps: PatternStep[] = []
  if (def.name !== def.node.id) {
    const route = patternStepsOf(def.name, def.node.id)
    if (!route) return null
    ;({ init, steps } = projectStatic(init, route))
  }
  if (
    unwrapTs(init)?.type === "ObjectExpression" &&
    isEscaped(variable, context)
  )
    return null
  return { init, variable, steps }
}

// The component's own receivers: `const props = defineProps()`,
// `useAttrs()`, and the locals a destructured `class` or `style` prop
// binds. Vue passes class and style by fallthrough; a value that is one
// of these reads is the received prop, opaque to this file.
const classReceivers = new WeakMap<
  object,
  {
    receivers: Set<string>
    locals: Map<string, string>
  }
>()

function receiversOfContext(context: any) {
  const cached = classReceivers.get(context)
  if (cached) return cached
  const receivers = new Set<string>(["$attrs"])
  const locals = new Map<string, string>()
  const program = context.sourceCode?.ast
  if (program) {
    walk(program, (node: any, parent: any) => {
      if (node.type !== "CallExpression") return
      const callee = node.callee
      if (callee?.type !== "Identifier") return
      const isProps = callee.name === "defineProps"
      const isAttrs = callee.name === "useAttrs"
      // `withDefaults(defineProps(), { ... })`: the receiver is the
      // declarator around the wrapping call.
      let wrapper = parent
      if (
        wrapper?.type === "CallExpression" &&
        wrapper.callee?.name === "withDefaults"
      )
        wrapper = wrapper.parent
      const declarator = wrapper?.type === "VariableDeclarator" ? wrapper : null
      const id = declarator?.id
      if (!id || (!isProps && !isAttrs)) return
      if (id.type === "Identifier") {
        receivers.add(id.name)
      } else if (id.type === "ObjectPattern") {
        for (const property of id.properties ?? []) {
          if (property.type !== "Property") continue
          const key = keyName(property)
          const local =
            property.value?.type === "AssignmentPattern"
              ? property.value.left
              : property.value
          if (typeof key === "string" && local?.type === "Identifier") {
            locals.set(local.name, key)
            receivers.add(local.name)
          }
        }
      }
    })
  }
  const entry = { receivers, locals }
  classReceivers.set(context, entry)
  return entry
}

type ValueAlternative = { value: any } | { unresolved: any }

// The authored defaults behind the received class of this very
// component, in cascade order. The received part stays opaque; a
// `withDefaults` object or a destructured default is authored here.
export function forwardedValuesOf(
  node: any,
  context: any,
  name: string,
  path: Set<any>
) {
  const { receivers, locals } = receiversOfContext(context)
  const alternatives: ValueAlternative[] = []
  let token: any = null

  if (node?.type === "Identifier") {
    const key = locals.get(node.name)
    if (key !== name) return null
    token = node
    const variable = variableOf(node, context)
    const def = variable?.defs?.[0]
    // Vue 3.5 reactive-props destructure: `const { class: cls = "p-4" }`.
    if (def?.node?.id?.type === "ObjectPattern") {
      for (const property of def.node.id.properties ?? []) {
        if (property.type !== "Property" || keyName(property) !== name) continue
        const value = property.value
        if (value?.type === "AssignmentPattern") {
          alternatives.push({ value: value.right })
          break
        }
      }
    }
  } else if (node?.type === "MemberExpression") {
    const key = node.computed ? staticKey(node.property) : node.property?.name
    const object = unwrapTs(node.object)
    if (key !== name || object?.type !== "Identifier") return null
    if (!receivers.has(object.name)) return null
    token = object
    const variable = variableOf(object, context)
    const def = variable?.defs?.[0]
    const init = unwrapTs(def?.node?.init)
    if (init?.type !== "CallExpression") return null
    const callee = init.callee
    if (callee?.type !== "Identifier") return null
    // `withDefaults(defineProps(), { class: "p-4" })`, or a runtime
    // `defineProps({ class: { default: "p-4" } })`.
    if (callee.name === "withDefaults") {
      const defaults = unwrapTs(init.arguments?.[1])
      if (defaults?.type === "ObjectExpression") {
        const found = resolveProperty(defaults, name, context, path)
        if (found.uncertain) alternatives.push({ unresolved: defaults })
        else if (found.value) alternatives.push({ value: found.value })
      }
    } else if (callee.name === "defineProps") {
      const runtime = unwrapTs(init.arguments?.[0])
      if (runtime?.type === "ObjectExpression") {
        const found = resolveProperty(runtime, name, context, path)
        const shape =
          found.value && !found.uncertain ? unwrapTs(found.value) : null
        if (shape?.type === "ObjectExpression") {
          const inner = resolveProperty(shape, "default", context, path)
          if (inner.uncertain) alternatives.push({ unresolved: shape })
          else if (inner.value) alternatives.push({ value: inner.value })
        }
      }
    }
  } else {
    return null
  }

  if (path.has(token)) return { variable: token, alternatives: [] }
  return { variable: token, alternatives }
}

// True when the value is the component's own received prop — the
// sanctioned opaque value the parent authors, not this file.
export function isForwardedProp(node: any, context: any, name: string) {
  return forwardedValuesOf(node, context, name, new Set()) !== null
}

function keyName(prop: any) {
  if (prop.computed) return staticKey(prop.key)
  if (prop.key?.type === "Identifier") return prop.key.name
  if (prop.key?.type === "Literal") return String(prop.key.value)
  return null
}

function staticKey(key: any) {
  if (key?.type === "Literal") return String(key.value)
  if (key?.type === "TemplateLiteral" && key.expressions.length === 0) {
    return key.quasis[0]?.value?.cooked ?? null
  }
  return null
}

function unwrapTs(node: any) {
  while (
    node &&
    (node.type === "TSAsExpression" ||
      node.type === "TSNonNullExpression" ||
      node.type === "TSSatisfiesExpression")
  ) {
    node = node.expression
  }
  return node
}

export function resolveObject(node: any, context: any, path: Set<any>) {
  node = unwrapTs(node)
  if (node?.type === "ObjectExpression") return node
  if (node?.type !== "Identifier") return null
  const resolved = resolveIdentifier(node, context, path)
  const init = resolved && unwrapTs(resolved.init)
  return init?.type === "ObjectExpression" ? init : null
}

// A member read cannot trust an object handed to any call.
function resolveMemberObject(node: any, context: any, path: Set<any>) {
  node = unwrapTs(node)
  if (node?.type === "Identifier") {
    const variable = variableOf(node, context)
    if (variable && isEscaped(variable)) return null
  }
  return resolveObject(node, context, path)
}

// Entries in source order, same-file spreads flattened in. What cannot
// be read stays as unknown, so a reader knows a later write may exist.
export type ObjectEntry = { key: string; value: any } | { unknown: any }

export function objectEntries(
  object: any,
  context: any,
  path: Set<any>,
  depth = 0
): ObjectEntry[] {
  const entries: ObjectEntry[] = []
  for (const prop of object.properties) {
    if (prop.type === "SpreadElement") {
      const arg = unwrapTs(prop.argument)
      const inner = depth < 4 ? resolveObject(arg, context, path) : null
      if (!inner) {
        entries.push({ unknown: prop })
        continue
      }
      const variable =
        arg?.type === "Identifier"
          ? resolveIdentifier(arg, context, path)?.variable
          : null
      if (variable) path.add(variable)
      entries.push(...objectEntries(inner, context, path, depth + 1))
      if (variable) path.delete(variable)
      continue
    }
    if (prop.type !== "Property") {
      entries.push({ unknown: prop })
      continue
    }
    const key = keyName(prop)
    if (key === null) entries.push({ unknown: prop })
    else entries.push({ key, value: prop.value })
  }
  return entries
}

// The value `key` has by the end of the literal: the last write wins,
// and an unreadable spread after it makes the answer uncertain.
export function resolveProperty(
  object: any,
  key: string,
  context: any,
  path: Set<any>
) {
  let value: any = undefined
  let uncertain = false
  for (const entry of objectEntries(object, context, path)) {
    if ("unknown" in entry) {
      uncertain = true
    } else if (entry.key === key) {
      value = entry.value
      uncertain = false
    }
  }
  return { value, uncertain }
}

// A member's final value, or the expression that stays unresolved.
export function resolveMemberValue(node: any, context: any, path: Set<any>) {
  const key = keyName({ key: node.property, computed: node.computed })
  const object =
    key === null ? null : resolveMemberObject(node.object, context, path)
  const found = object
    ? resolveProperty(object, key!, context, path)
    : { value: undefined, uncertain: true }
  if (found.value === undefined || found.uncertain) {
    return { key, unresolved: node }
  }
  const variable =
    node.object?.type === "Identifier"
      ? resolveIdentifier(node.object, context, path)?.variable
      : null
  return { key, value: found.value, variable }
}

export function collectClassStrings(
  expression: any,
  context: any,
  options: {
    mergeFunctions?: Set<string>
    variantFunctions?: Set<string>
    resolve?: boolean
    valuesMode?: boolean
    onHelperCall?: (node: any) => void
  } = {}
) {
  const helpers = options.mergeFunctions ?? new Set(DEFAULT_MERGE_FUNCTIONS)
  const valueHelpers =
    options.variantFunctions ?? new Set(DEFAULT_VARIANT_FUNCTIONS)
  const resolve = options.resolve ?? true
  const contextualStrings: ClassString[] = []
  const vocabularyStrings: ClassString[] = []
  const unresolved: any[] = []
  const path = new Set<any>()
  let resolvedCalls = 0

  const push = (value: string, node: any) => {
    const string = { value, node }
    contextualStrings.push(string)
    if (resolvedCalls === 0) vocabularyStrings.push(string)
  }

  // The slot a destructured binding reads, followed through the branches
  // of its initializer: `const [, , cls] = ok ? a : b` reads element 2 of
  // a and of b. A shape the steps cannot enter is unresolved, not read
  // whole: its other slots were never classes.
  const visitThrough = (
    node: any,
    steps: PatternStep[],
    valuesMode: boolean
  ): void => {
    if (!steps.length) {
      visit(node, valuesMode)
      return
    }
    const value = unwrapTs(node)
    switch (value?.type) {
      case "ConditionalExpression":
        visitThrough(value.consequent, steps, valuesMode)
        visitThrough(value.alternate, steps, valuesMode)
        return
      case "LogicalExpression":
        if (value.operator !== "&&") visitThrough(value.left, steps, valuesMode)
        visitThrough(value.right, steps, valuesMode)
        return
      case "Identifier": {
        const resolved = resolve
          ? resolveIdentifier(value, context, path)
          : null
        if (!resolved) {
          unresolved.push(value)
          return
        }
        path.add(resolved.variable)
        visitThrough(resolved.init, [...resolved.steps, ...steps], valuesMode)
        path.delete(resolved.variable)
        return
      }
      case "ArrayExpression":
      case "ObjectExpression": {
        const projected = projectStatic(value, steps)
        if (projected.steps.length === steps.length) {
          unresolved.push(value)
          return
        }
        visitThrough(projected.init, projected.steps, valuesMode)
        return
      }
      default:
        unresolved.push(node)
    }
  }

  // The value a script binding wraps: `computed(() => ...)` returns it
  // through its callback, `ref(...)` holds it directly.
  const unwrapVueValue = (call: any) => {
    const argument = call.arguments?.[0]
    if (call.callee?.name === "computed") {
      if (argument?.type === "ArrowFunctionExpression") {
        const body = argument.body
        return body?.type === "BlockStatement"
          ? (body.body?.find((s: any) => s.type === "ReturnStatement")
              ?.argument ?? null)
          : body
      }
      return argument ?? null
    }
    return argument ?? null
  }

  const visit = (node: any, valuesMode: boolean) => {
    if (!node) return
    const forwarded = resolve
      ? forwardedValuesOf(node, context, "class", path)
      : null
    if (forwarded) {
      // The incoming prop stays opaque; a default is authored here.
      if (path.has(forwarded.variable)) return
      path.add(forwarded.variable)
      for (const alternative of forwarded.alternatives) {
        if ("unresolved" in alternative) unresolved.push(alternative.unresolved)
        else visit(alternative.value, valuesMode)
      }
      path.delete(forwarded.variable)
      return
    }
    switch (node.type) {
      case "Literal":
        if (typeof node.value === "string") push(node.value, node)
        return
      case "TemplateLiteral":
        node.quasis.forEach((quasi: any, i: number) => {
          let text: string = quasi.value?.cooked ?? ""
          // A glued interpolation leaves no class of its own.
          if (i > 0 && !/^\s/.test(text)) text = text.replace(/^\S+/, "")
          if (i < node.expressions.length && !/\s$/.test(text))
            text = text.replace(/\S+$/, "")
          if (text.trim()) push(text, quasi)
        })
        node.expressions.forEach((expr: any, i: number) => {
          const before: string = node.quasis[i]?.value?.cooked ?? ""
          const after: string = node.quasis[i + 1]?.value?.cooked ?? ""
          const glued =
            (before !== "" && !/\s$/.test(before)) ||
            (after !== "" && !/^\s/.test(after))
          if (glued) {
            if (!unresolved.includes(node)) unresolved.push(node)
          } else visit(expr, valuesMode)
        })
        return
      case "ConditionalExpression":
        visit(node.consequent, valuesMode)
        visit(node.alternate, valuesMode)
        return
      case "LogicalExpression":
        if (node.operator !== "&&") visit(node.left, valuesMode)
        visit(node.right, valuesMode)
        return
      case "ArrayExpression":
        for (const el of node.elements) visit(el, valuesMode)
        return
      case "ObjectExpression":
        for (const entry of objectEntries(node, context, path)) {
          if ("unknown" in entry) {
            unresolved.push(entry.unknown)
          } else if (valuesMode) {
            visit(entry.value, valuesMode)
          } else {
            // { rounded: true }: the key is the class.
            push(entry.key, keyNodeOf(node, entry))
          }
        }
        return
      case "CallExpression": {
        const callee =
          node.callee?.type === "Identifier" ? node.callee.name : null
        if (callee && helpers.has(callee)) {
          // A call reached by resolving an identifier keeps its own site.
          const hopped = path.size > 0
          if (!hopped && node !== expression) options.onHelperCall?.(node)
          if (hopped) resolvedCalls++
          if (valueHelpers.has(callee)) {
            for (const arg of node.arguments) visitVariantConfig(arg)
          } else {
            for (const arg of node.arguments) visit(arg, false)
          }
          if (hopped) resolvedCalls--
          return
        }
        if (callee && VUE_VALUE_FUNCTIONS.has(callee)) {
          const inner = unwrapVueValue(node)
          if (inner) visit(inner, valuesMode)
          else if (!unresolved.includes(node)) unresolved.push(node)
          return
        }
        unresolved.push(node)
        return
      }
      case "Identifier": {
        if (node.name === "undefined") return
        const resolved = resolve ? resolveIdentifier(node, context, path) : null
        if (!resolved) {
          unresolved.push(node)
          return
        }
        path.add(resolved.variable)
        visitThrough(resolved.init, resolved.steps, valuesMode)
        path.delete(resolved.variable)
        return
      }
      case "MemberExpression": {
        const found = resolveMemberValue(node, context, path)
        if (!found.key || "unresolved" in found) {
          unresolved.push(node)
          return
        }
        if (found.variable) path.add(found.variable)
        visit(found.value, valuesMode)
        if (found.variable) path.delete(found.variable)
        return
      }
      case "TSAsExpression":
      case "TSNonNullExpression":
      case "TSSatisfiesExpression":
        visit(node.expression, valuesMode)
        return
      default:
        unresolved.push(node)
    }
  }

  // In a cva or tv config, `defaultVariants` and the selectors inside
  // compoundVariants are names, not classes.
  const visitVariantConfig = (node: any) => {
    if (!node) return
    if (node.type !== "ObjectExpression") {
      visit(node, true)
      return
    }
    for (const prop of node.properties) {
      if (prop.type !== "Property") {
        unresolved.push(prop)
        continue
      }
      switch (keyName(prop)) {
        case "base":
        case "slots":
        case "class":
        case "className":
        case "variants":
          visit(prop.value, true)
          break
        case "compoundVariants":
        case "compoundSlots":
          if (prop.value?.type === "ArrayExpression") {
            for (const entry of prop.value.elements) {
              if (entry?.type !== "ObjectExpression") continue
              for (const inner of entry.properties) {
                if (inner.type !== "Property") continue
                const innerKey = keyName(inner)
                if (innerKey === "class" || innerKey === "className")
                  visit(inner.value, true)
              }
            }
          }
          break
        default:
          break
      }
    }
  }

  visit(expression, options.valuesMode ?? false)
  return { contextualStrings, vocabularyStrings, unresolved }
}

function keyNodeOf(object: any, entry: { key: string; value: any }) {
  for (const prop of object.properties) {
    if (prop.type === "Property" && prop.value === entry.value) return prop.key
  }
  return object
}

// Classes directly, or the values of a class object's properties.
export function collectFromValue(
  value: any,
  context: any,
  options: Parameters<typeof collectClassStrings>[2] = {}
) {
  if (!value)
    return {
      contextualStrings: [] as ClassString[],
      vocabularyStrings: [] as ClassString[],
      unresolved: [] as any[],
    }
  const object = resolveObject(value, context, new Set())
  if (object) {
    return collectClassStrings(object, context, {
      ...options,
      valuesMode: true,
    })
  }
  return collectClassStrings(value, context, options)
}

export type SiteOptions = TrackerOptions & {
  mergeFunctions?: string[]
  variantFunctions?: string[]
  scanAllStrings?: boolean
}

// Per-file state shared by every rule: ESLint runs them over one AST in
// one traversal, so the first rule to reach a node computes its site and
// the others read it. Keyed by the Program node, so it lives exactly as
// long as the parse.
type Shared = {
  // Built on first use: a file with nothing to check never reads the ui
  // directory.
  tracker: () => ReturnType<typeof createComponentTracker>
  helpers: Set<string>
  helperCall: RegExp
  collectOptions: {
    mergeFunctions?: Set<string>
    variantFunctions?: Set<string>
    onHelperCall?: (node: any) => void
  }
  consumedCalls: Set<any>
  imports: Set<any>
  sites: Map<any, ClassSite[]>
  hasSites: boolean
}

const sharedByProgram = new WeakMap<object, Map<string, Shared>>()

type Visitor = (node: any) => void

const NO_VISITORS: Record<string, Visitor | undefined> = {}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

const helperSets = new Map<
  string,
  { helpers: Set<string>; variantFunctions: Set<string>; helperCall: RegExp }
>()

function helpersFor(key: string, options: SiteOptions) {
  const cached = helperSets.get(key)
  if (cached) return cached
  const helpers = new Set([
    ...DEFAULT_MERGE_FUNCTIONS,
    ...(options.mergeFunctions ?? []),
    ...(options.variantFunctions ?? []),
  ])
  const variantFunctions = new Set([
    ...DEFAULT_VARIANT_FUNCTIONS,
    ...(options.variantFunctions ?? []),
  ])
  const source = [...helpers].map(escapeRegExp).join("|")
  const entry = {
    helpers,
    variantFunctions,
    helperCall: new RegExp(`\\b(?:${source})\\s*\\(`),
  }
  helperSets.set(key, entry)
  return entry
}

const optionKeys = new WeakMap<object, string>()

// ESLint hands every file the same options object for a given config.
function keyOf(options: SiteOptions) {
  const cached = optionKeys.get(options)
  if (cached) return cached
  const key = JSON.stringify([
    options.componentImports ?? [],
    options.ignoreImports ?? [],
    options.mergeFunctions ?? [],
    options.variantFunctions ?? [],
    options.scanAllStrings ?? false,
  ])
  optionKeys.set(options, key)
  return key
}

function sharedFor(context: any, options: SiteOptions): Shared {
  const program = context.sourceCode?.ast
  const key = keyOf(options)
  let byOptions = sharedByProgram.get(program)
  if (!byOptions) {
    byOptions = new Map()
    sharedByProgram.set(program, byOptions)
  }
  const cached = byOptions.get(key)
  if (cached) return cached
  const { helpers, variantFunctions, helperCall } = helpersFor(key, options)
  const consumedCalls = new Set<any>()
  const text = context.sourceCode?.text ?? ""
  let tracker: ReturnType<typeof createComponentTracker> | null = null
  const shared: Shared = {
    tracker: () => (tracker ??= createComponentTracker(context, options)),
    helpers,
    helperCall,
    collectOptions: {
      mergeFunctions: helpers,
      variantFunctions,
      // A helper call a site's value walk consumes is no site of its
      // own.
      onHelperCall: (node: any) => consumedCalls.add(node),
    },
    consumedCalls,
    imports: new Set(),
    sites: new Map(),
    hasSites:
      typeof text !== "string" || /class/i.test(text) || helperCall.test(text),
  }
  byOptions.set(key, shared)
  return shared
}

// The final value of each class-like key in a readable spread is a
// site of its own. An unreadable spread is left alone, by design.
function spreadSites(
  node: any,
  context: any,
  shared: Shared,
  makeSite: (
    node: any,
    value: any,
    attribute: string | null,
    resolved: ResolvedElement | null,
    element: any
  ) => ClassSite
) {
  let list = shared.sites.get(node)
  if (list) return list
  list = []
  const object = resolveObject(node.value?.expression, context, new Set())
  if (object) {
    // The spread's element: attribute → start tag → element.
    const element = node.parent?.parent ?? null
    const resolved =
      element?.type === "VElement"
        ? shared.tracker().resolve(element.rawName)
        : null
    const finals = new Map<string, any>()
    for (const entry of objectEntries(object, context, new Set())) {
      if ("key" in entry && isClassAttribute(entry.key)) {
        finals.set(entry.key, entry.value)
      }
    }
    for (const [key, value] of finals) {
      list.push(
        makeSite(
          value,
          value,
          key,
          resolved,
          element?.type === "VElement" ? element : null
        )
      )
    }
  }
  shared.sites.set(node, list)
  return list
}

// A .vue file that arrives without its framework's parser has only its
// script blocks in the AST (Oxlint does this). Passing quietly would
// read as "checked", so it says so once.
export function warnUnreadTemplates(context: any) {
  if (isSfc(fileOf(context))) {
    warnOnce(
      "templates:unread",
      "Templates in .vue files are read under ESLint with vue-eslint-parser. This run has no template parser, so only their script blocks are linted. See https://github.com/tpapamichail/shadcn-vue-ui-lint#get-started."
    )
  }
}

// Calls `onSite` for every class site in the file.
export function classSiteVisitors(
  context: any,
  options: SiteOptions,
  onSite: (site: ClassSite) => void
) {
  const services = context.sourceCode?.parserServices
  if (!services?.defineTemplateBodyVisitor) {
    warnUnreadTemplates(context)
    return NO_VISITORS
  }
  const shared = sharedFor(context, options)
  if (!shared.hasSites && !options.scanAllStrings) return NO_VISITORS
  const { helpers, collectOptions, consumedCalls, sites } = shared
  const reportedStrings = new WeakSet<any>()
  // A literal several sites reach is one vocabulary check, owned by the
  // first, but every site still judges it in its own context.
  const claimedVocabulary = new WeakSet<any>()

  const emit = (site: ClassSite) => {
    for (const string of site.contextualStrings)
      reportedStrings.add(string.node)
    const vocabularyStrings = site.vocabularyStrings.filter((string) => {
      if (claimedVocabulary.has(string.node)) return false
      claimedVocabulary.add(string.node)
      return true
    })
    onSite(
      vocabularyStrings.length === site.vocabularyStrings.length
        ? site
        : { ...site, vocabularyStrings }
    )
  }

  // The element an attribute belongs to: attribute → start tag → element.
  const elementOfAttribute = (attribute: any) => {
    const startTag = attribute?.parent
    const element = startTag?.parent
    return startTag?.type === "VStartTag" && element?.type === "VElement"
      ? element
      : null
  }

  // Fragments and text are not layout parents.
  const enclosingOf = (
    element: any,
    accepts: (component: string) => boolean
  ) => {
    let direct = true
    for (let node = element?.parent; node; node = node.parent) {
      if (node.type !== "VElement") continue
      const resolved = shared.tracker().resolve(node.rawName)
      if (resolved && accepts(resolved.component)) {
        return { name: node.rawName, direct }
      }
      direct = false
    }
    return null
  }

  const closedParentOf = (
    element: any,
    accepts: (component: string) => boolean
  ) => {
    for (let node = element?.parent; node; node = node.parent) {
      if (node.type !== "VElement") continue
      const resolved = shared.tracker().resolve(node.rawName)
      return resolved && !accepts(resolved.component) ? node.rawName : null
    }
    return null
  }

  // A static `class` attribute reports and fixes through a literal that
  // quotes exactly what the source has.
  const literalOf = (attribute: any) => {
    const value = attribute.value
    if (!value || value.type !== "VLiteral") return null
    const range = value.range
    const raw =
      typeof range === "object" && range
        ? context.sourceCode?.text?.slice(range[0], range[1])
        : undefined
    return {
      type: "Literal",
      value: value.value,
      raw,
      loc: value.loc,
      range,
      parent: attribute,
    }
  }

  const siteFor = (
    node: any,
    value: any,
    attribute: string | null,
    resolved: ResolvedElement | null,
    element: any = null,
    script = false
  ): ClassSite => {
    // Template expressions read the script-setup scope through a shim;
    // script sites keep the real scopes.
    const reader = script ? context : templateContextOf(context)
    const classes = value
      ? collectFromValue(value, reader, collectOptions)
      : collectClassStrings(node, reader, collectOptions)
    return {
      ...classes,
      component: resolved?.component ?? null,
      componentFile: resolved?.file ?? null,
      wrapper: resolved?.wrapper ?? null,
      attribute,
      node,
      enclosingContainer: (accepts) =>
        element ? enclosingOf(element, accepts) : null,
      closedParent: (accepts) =>
        element ? closedParentOf(element, accepts) : null,
    }
  }

  const attributeSites = (node: any) => {
    let list = sites.get(node)
    if (list) return list
    const element = elementOfAttribute(node)
    const value = node.directive
      ? (node.value?.expression ?? null)
      : literalOf(node)
    list = [
      siteFor(
        node,
        value,
        attributeNameOf(node) || null,
        element ? shared.tracker().resolve(element.rawName) : null,
        element
      ),
    ]
    sites.set(node, list)
    return list
  }

  const callSites = (node: any) => {
    let list = sites.get(node)
    if (list) return list
    list = [siteFor(node, null, null, null, null, true)]
    sites.set(node, list)
    return list
  }

  const templateVisitor = {
    VAttribute(node: any) {
      if (!node.directive) {
        if (!isClassAttribute(String(node.key?.name ?? ""))) return
        for (const site of attributeSites(node)) emit(site)
        return
      }
      if (node.key?.name?.name !== "bind") return
      const argument = node.key?.argument?.name
      if (typeof argument === "string") {
        if (!isClassAttribute(argument)) return
        for (const site of attributeSites(node)) emit(site)
        return
      }
      // A spread with no argument: `v-bind="{ class: 'p-4' }"` or the
      // opaque `v-bind="$attrs"`.
      for (const site of spreadSites(node, context, shared, siteFor)) emit(site)
    },
  }

  const scriptVisitor = {
    ImportDeclaration(node: any) {
      if (shared.imports.has(node)) return
      shared.imports.add(node)
      shared.tracker().collectImport(node)
    },
    CallExpression(node: any) {
      if (consumedCalls.has(node)) return
      const callee =
        node.callee?.type === "Identifier" ? node.callee.name : null
      if (!callee || !helpers.has(callee)) return
      for (const site of callSites(node)) emit(site)
    },
    ...(options.scanAllStrings
      ? {
          // Every string literal, the way Tailwind's scanner reads them.
          // One claimed here is not reported again by a later site.
          Literal(node: any) {
            if (typeof node.value !== "string" || !node.value.includes("-"))
              return
            if (reportedStrings.has(node) || claimedVocabulary.has(node)) return
            if (node.parent?.type === "ImportDeclaration") return
            const strings = [{ value: node.value, node }]
            emit({
              contextualStrings: strings,
              vocabularyStrings: strings,
              unresolved: [],
              component: null,
              componentFile: null,
              wrapper: null,
              attribute: null,
              node,
              enclosingContainer: () => null,
              closedParent: () => null,
            })
          },
        }
      : {}),
  }

  return services.defineTemplateBodyVisitor(templateVisitor, scriptVisitor)
}
