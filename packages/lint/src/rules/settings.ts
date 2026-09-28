// settings["shadcn-vue"]: the recognition options written once instead of once
// per rule, with a rule's own option winning. `ui` is an import prefix,
// what components.json's aliases.ui is for projects without that file.
// `componentPrefix` is the tag prefix a framework's component registration
// adds (`<UiButton>` for a `Ui` prefix), so an auto-imported design-system
// component is recognized without an import statement.

import { warnOnce } from "../project/warn"

const SHARED = [
  "componentImports",
  "ignoreImports",
  "mergeFunctions",
  "variantFunctions",
] as const

function strings(value: unknown, key: string) {
  const list = Array.isArray(value) ? value : value == null ? [] : [value]
  if (!list.every((v) => typeof v === "string")) {
    warnOnce(
      `settings:${key}`,
      `settings["shadcn-vue"].${key} must be a string or an array of strings; it is ignored.`
    )
    return null
  }
  return list as string[]
}

// The one prefix a framework's component registration puts in front of
// every name, as Nuxt's `components: [{ prefix: "Ui" }]` does. One
// string, not a list: the setting names the prefix itself.
function prefixText(value: unknown) {
  if (typeof value !== "string") {
    warnOnce(
      "settings:componentPrefix",
      'settings["shadcn-vue"].componentPrefix must be a string; it is ignored.'
    )
    return null
  }
  return value
}

function escapeRegExp(text: string) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

export function withSettings<T extends Record<string, unknown>>(
  context: any,
  options: T
) {
  const settings = context.settings?.["shadcn-vue"]
  if (!settings || typeof settings !== "object") return options
  const merged: Record<string, unknown> = { ...options }
  for (const key of SHARED) {
    if (merged[key] !== undefined || settings[key] === undefined) continue
    const list = strings(settings[key], key)
    if (list) merged[key] = list
  }
  if (
    merged.componentPrefix === undefined &&
    settings.componentPrefix !== undefined
  ) {
    const value = prefixText(settings.componentPrefix)
    if (value) merged.componentPrefix = value
  }
  if (settings.ui !== undefined) {
    const prefixes = strings(settings.ui, "ui") ?? []
    if (prefixes.length) {
      merged.componentImports = [
        ...((merged.componentImports as string[] | undefined) ?? []),
        ...prefixes.map((prefix) => `^${escapeRegExp(prefix)}(/|$)`),
      ]
    }
  }
  return merged as T
}
