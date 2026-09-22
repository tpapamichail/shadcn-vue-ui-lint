// One tree walk for every analysis that reads an AST without ESLint's
// traversal. Skips the parent back-reference ESLint adds.

// The parse-tree node the analysis walks. oxc, @typescript-eslint and
// espree all produce this shape; fields beyond the ESTree surface stay
// opaque, and the readers below are the one place that trust is spent.
export type Node = {
  type: string
  parent?: Node | undefined
  loc?: {
    start: { line: number; column: number }
    end: { line: number; column: number }
  }
  range?: [number, number]
  [field: string]: unknown
}

// The four reads the analysis makes off a loose node, each narrowing
// once against the named type the parsers agree on. Anything else is a
// field a reader narrows itself.
export function child<T extends Node = Node>(
  node: unknown,
  field: string
): T | null {
  const value = (node as Record<string, unknown> | null | undefined)?.[field]
  return value && typeof value === "object" && typeof (value as Node).type === "string"
    ? (value as T)
    : null
}

export function list<T extends Node = Node>(node: unknown, field: string): T[] {
  const value = (node as Record<string, unknown> | null | undefined)?.[field]
  return Array.isArray(value)
    ? value.filter((item) => item && typeof (item as Node).type === "string")
    : []
}

export function text(node: unknown, field: string): string | null {
  const value = (node as Record<string, unknown> | null | undefined)?.[field]
  return typeof value === "string" ? value : null
}

export function flag(node: unknown, field: string): boolean | null {
  const value = (node as Record<string, unknown> | null | undefined)?.[field]
  return typeof value === "boolean" ? value : null
}

export function walk(
  node: Node | null,
  visit: (node: Node, parent: Node | null) => void,
  parent: Node | null = null
) {
  if (!node) return
  visit(node, parent)
  for (const key of Object.keys(node)) {
    if (key === "parent") continue
    const value = (node as Record<string, unknown>)[key]
    if (Array.isArray(value)) {
      for (const item of value) walk((item as Node) ?? null, visit, node)
    } else if (
      value &&
      typeof value === "object" &&
      typeof (value as Node).type === "string"
    ) {
      walk(value as Node, visit, node)
    }
  }
}