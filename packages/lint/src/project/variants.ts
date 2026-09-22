// A component's variant axes, from its cva/tv definitions and from props
// typed as a union of string literals, which is the same shape written
// without a factory. Messages list these so reuse is the first option.

import * as fs from "node:fs"

import { child, list, text, walk, type Node } from "./ast"
import { mtimeOf } from "./fs"
import { parseSource } from "./parser"
import { sfcComponentName, sfcOf } from "./sfc"

export type VariantDefinition = {
  // buttonVariants, or the component whose props declare the axes.
  name: string | null
  axes: Record<string, string[]>
  // A factory stands in for any component in its file; props do not.
  source: "factory" | "props"
}

const cache = new Map<
  string,
  { mtimeMs: number; definitions: VariantDefinition[] }
>()

const VARIANT_FACTORIES = new Set(["cva", "tv"])

function keyName(node: any) {
  if (node.type === "Identifier") return node.name
  if (node.type === "Literal" && typeof node.value === "string")
    return node.value
  return null
}

function axesOf(config: any) {
  const axes: Record<string, string[]> = {}
  if (config?.type !== "ObjectExpression") return axes
  const variants = config.properties.find(
    (p: any) => p.type === "Property" && keyName(p.key) === "variants"
  )
  if (variants?.value?.type !== "ObjectExpression") return axes
  for (const axis of variants.value.properties) {
    if (axis.type !== "Property") continue
    const axisName = keyName(axis.key)
    if (!axisName || axis.value?.type !== "ObjectExpression") continue
    axes[axisName] = axis.value.properties
      .filter((p: any) => p.type === "Property")
      .map((p: any) => keyName(p.key))
      .filter((k: any): k is string => typeof k === "string")
  }
  return axes
}

const MAY_DEFINE_VARIANTS = /\b(?:cva|tv)\s*\(|\|\s*["']|\bkeyof\s+typeof\b/

// How far a type is followed through parentheses, aliases and unions
// before it is given up as unreadable.
const MAX_TYPE_DEPTH = 8

// oxc keeps parentheses in the type AST; @typescript-eslint drops them.
function unwrapType(type: any) {
  let out = type
  for (
    let depth = 0;
    out?.type === "TSParenthesizedType" && depth < MAX_TYPE_DEPTH;
    depth++
  ) {
    out = out.typeAnnotation
  }
  return out
}

// The keys of `const VARIANTS = { ... } as const`, the axis a lookup
// object declares. Null when a spread or a computed key hides one: a
// partial list of variants is worse than none.
function objectKeys(object: any) {
  if (object?.type !== "ObjectExpression") return null
  const keys: string[] = []
  for (const property of object.properties) {
    if (property.type !== "Property" || property.computed) return null
    const key = keyName(property.key)
    if (!key) return null
    keys.push(key)
  }
  return keys.length ? keys : null
}

// Null unless every member is a string literal (or undefined, for `?:`).
// A same-file alias and `keyof typeof` a lookup object name the same axis
// as an inline union, which is how a design system without cva writes it.
function literalValues(
  input: any,
  declared: ReturnType<typeof declarationsIn>,
  depth = 0
) {
  const type = unwrapType(input)
  if (!type || depth > MAX_TYPE_DEPTH) return null
  if (type.type === "TSTypeReference" && type.typeName?.type === "Identifier") {
    return literalValues(
      declared.types.get(type.typeName.name),
      declared,
      depth + 1
    )
  }
  if (
    type.type === "TSTypeOperator" &&
    type.operator === "keyof" &&
    type.typeAnnotation?.type === "TSTypeQuery" &&
    type.typeAnnotation.exprName?.type === "Identifier"
  ) {
    return objectKeys(declared.objects.get(type.typeAnnotation.exprName.name))
  }
  if (type.type === "TSUnionType") {
    const values: string[] = []
    for (const member of type.types) {
      if (member.type === "TSUndefinedKeyword") continue
      const nested = literalValues(member, declared, depth + 1)
      if (!nested) return null
      values.push(...nested)
    }
    return values.length ? values : null
  }
  if (
    type.type === "TSLiteralType" &&
    type.literal?.type === "Literal" &&
    typeof type.literal.value === "string"
  ) {
    return [type.literal.value as string]
  }
  return null
}

// Follows intersections, unions and same-file aliases, so
// `VariantProps<typeof buttonVariants> & Props` resolves.
function axesOfPropsType(
  input: any,
  declared: ReturnType<typeof declarationsIn>,
  depth = 0
) {
  const axes: Record<string, string[]> = {}
  const type = unwrapType(input)
  if (!type || depth > MAX_TYPE_DEPTH) return axes
  if (type.type === "TSIntersectionType") {
    for (const member of type.types) {
      Object.assign(axes, axesOfPropsType(member, declared, depth + 1))
    }
    return axes
  }
  // A props union (an anchor or a button, one set of variants): only what
  // every member accepts is a variant of the component.
  if (type.type === "TSUnionType") {
    const [first, ...rest]: Record<string, string[]>[] = type.types.map(
      (member: any) => axesOfPropsType(member, declared, depth + 1)
    )
    for (const [name, values] of Object.entries(first ?? {})) {
      const shared = values.filter((value) =>
        rest.every((other) => other[name]?.includes(value))
      )
      if (shared.length) axes[name] = shared
    }
    return axes
  }
  if (type.type === "TSTypeReference" && type.typeName?.type === "Identifier") {
    return axesOfPropsType(
      declared.types.get(type.typeName.name),
      declared,
      depth + 1
    )
  }
  const members =
    type.type === "TSTypeLiteral"
      ? type.members
      : type.type === "TSInterfaceBody"
        ? type.body
        : null
  if (!members) return axes
  for (const member of members) {
    if (member.type !== "TSPropertySignature") continue
    const key = keyName(member.key)
    const values = literalValues(
      member.typeAnnotation?.typeAnnotation,
      declared
    )
    if (key && values) axes[key] = values
  }
  return axes
}

// The file's aliases and interfaces, plus the object literals a
// `keyof typeof` can name. `as const` and `satisfies` wrap the object.
function declarationsIn(ast: Node) {
  const types = new Map<string, any>()
  const objects = new Map<string, any>()
  walk(ast, (node) => {
    const id = child(node, "id")
    const idName = text(id, "name")
    if (node.type === "TSTypeAliasDeclaration" && id?.type === "Identifier") {
      types.set(idName ?? "", child(node, "typeAnnotation"))
    } else if (
      node.type === "TSInterfaceDeclaration" &&
      id?.type === "Identifier"
    ) {
      types.set(idName ?? "", child(node, "body"))
    } else if (node.type === "VariableDeclarator" && id?.type === "Identifier") {
      const init = child(node, "init")
      const unwrapped =
        init?.type === "TSAsExpression" || init?.type === "TSSatisfiesExpression"
          ? child(init, "expression")
          : init
      if (unwrapped?.type === "ObjectExpression") objects.set(idName ?? "", unwrapped)
    }
  })
  return { types, objects }
}

// A component's first parameter and its name, for function declarations
// and a `const X = (props) => ...` that a render function uses.
function componentSignature(node: Node) {
  const id = child(node, "id")
  const name = text(id, "name")
  if (node.type === "FunctionDeclaration" && id?.type === "Identifier") {
    return { name: name ?? "", param: list(node, "params")[0] }
  }
  const init = child(node, "init")
  if (
    node.type === "VariableDeclarator" &&
    id?.type === "Identifier" &&
    (init?.type === "ArrowFunctionExpression" ||
      init?.type === "FunctionExpression")
  ) {
    return { name: name ?? "", param: list(init, "params")[0] }
  }
  return null
}

export function extractVariantDefinitions(source: string, file = "x.ts") {
  const definitions: VariantDefinition[] = []
  if (!MAY_DEFINE_VARIANTS.test(source)) return definitions
  let ast: Node
  try {
    ast = parseSource(source, file) as Node
  } catch {
    return definitions
  }
  return definitionsOfProgram(ast, file)
}

// The variant definitions in an already-parsed program: cva/tv
// factories, function-component props, and — in a Vue script-setup —
// `defineProps<{ ... }>()`, possibly wrapped by `withDefaults`.
export function definitionsOfProgram(ast: Node, file: string) {
  const definitions: VariantDefinition[] = []
  const declared = declarationsIn(ast)
  // A .vue file holds exactly one component: its props belong to the
  // name the filename gives it.
  const sfcName = /\.vue$/i.test(file) ? sfcComponentName(file) : null
  walk(ast, (node, parent) => {
    if (node.type === "CallExpression") {
      const callee = child(node, "callee")
      if (callee?.type !== "Identifier") return
      const calleeName = text(callee, "name") ?? ""
      if (!VARIANT_FACTORIES.has(calleeName)) {
        // `defineProps<{ ... }>()` or
        // `withDefaults(defineProps<{ ... }>(), { ... })`. The inner
        // call of a withDefaults is read through the outer one.
        const props = vuePropsTypeOf(node)
        if (!props) return
        if (
          calleeName === "defineProps" &&
          parent?.type === "CallExpression" &&
          text(child(parent, "callee"), "name") === "withDefaults"
        )
          return
        const axes = axesOfPropsType(props, declared)
        if (!sfcName || !Object.keys(axes).length) return
        definitions.push({ name: sfcName, axes, source: "props" })
        return
      }
      // cva(base, config); tv(config) or tv(base, config).
      const [first, second] = list(node, "arguments")
      const config =
        calleeName === "tv" && first?.type === "ObjectExpression"
          ? first
          : second
      const axes = axesOf(config)
      if (!Object.keys(axes).length) return
      const parentId = child(parent, "id")
      const name =
        parent?.type === "VariableDeclarator" && parentId?.type === "Identifier"
          ? text(parentId, "name")
          : null
      definitions.push({ name, axes, source: "factory" })
      return
    }
    const signature = componentSignature(node)
    if (!signature) return
    // `{ variant = "default" }: Props` or `props: Props`; the annotation
    // sits on the pattern either way.
    const annotation = child(signature.param, "typeAnnotation")
    const type = child(annotation, "typeAnnotation")
    const axes = axesOfPropsType(type, declared)
    if (!Object.keys(axes).length) return
    definitions.push({ name: signature.name, axes, source: "props" })
  })
  return definitions
}

// The type argument of a defineProps call, through a withDefaults wrap.
// Null for any other call, including a runtime defineProps object —
// its shape names no string union.
function vuePropsTypeOf(call: Node) {
  let node: Node | null = call
  const callee = child(node, "callee")
  if (callee?.type !== "Identifier") return null
  const calleeName = text(callee, "name")
  if (calleeName === "withDefaults") {
    const inner = list(node, "arguments")[0]
    if (inner?.type !== "CallExpression") return null
    node = inner
    const innerCallee = child(node, "callee")
    if (innerCallee?.type !== "Identifier") return null
    if (text(innerCallee, "name") !== "defineProps") return null
  } else if (calleeName !== "defineProps") {
    return null
  }
  const typeParameters =
    child(node, "typeArguments") ?? child(node, "typeParameters")
  return list(typeParameters, "params")[0] ?? null
}

export function variantDefinitionsOf(file: string) {
  const mtimeMs = mtimeOf(file)
  if (mtimeMs === null) return []
  const cached = cache.get(file)
  if (cached && cached.mtimeMs === mtimeMs) return cached.definitions
  let definitions: VariantDefinition[] = []
  try {
    if (/\.vue$/i.test(file)) {
      // The script block is already parsed; the template carries no
      // variants.
      const program = sfcOf(file)?.program
      definitions = program ? definitionsOfProgram(program, file) : []
    } else {
      definitions = extractVariantDefinitions(
        fs.readFileSync(file, "utf-8"),
        file
      )
    }
  } catch {
    definitions = []
  }
  cache.set(file, { mtimeMs, definitions })
  return definitions
}

// The definition for a component: the cva named after it
// (buttonVariants for Button), else the component's own props (Text),
// else the file's first cva. Another component's props never apply.
function definitionFor(file: string, component: string) {
  const definitions = variantDefinitionsOf(file)
  if (!definitions.length) return null
  const expected =
    component.charAt(0).toLowerCase() + component.slice(1) + "Variants"
  return (
    definitions.find((d) => d.name === expected) ??
    definitions.find((d) => d.name === component && d.source === "props") ??
    definitions.find((d) => d.source === "factory") ??
    null
  )
}

export function variantNamesFor(file: string, component: string) {
  const values = definitionFor(file, component)?.axes.variant
  return values?.length ? values : null
}

// The values of the component's size axis. Spacing findings offer them,
// because padding on a button usually means size.
export function sizeNamesFor(file: string, component: string) {
  const values = definitionFor(file, component)?.axes.size
  return values?.length ? values : null
}
