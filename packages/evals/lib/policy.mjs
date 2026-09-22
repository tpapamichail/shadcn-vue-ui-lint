// The configuration every measurement runs: the five rules the README
// recommends at error, and, inside the ui directory, the three rules
// that describe styling a component from outside turned off. The
// package ships no preset; this is the README's configuration, kept
// here so every script measures the same thing.

// The README's policy: layout crosses into every component, Card and
// its slots accept spacing too, and arbitrary values are judged on
// appearance only. Nothing is allowed until a config says so, and this
// is where this one says it.
export const NO_RESTYLE_OPTIONS = {
  allow: ["layout"],
  contracts: [
    {
      pattern: "^Card$|(Content|Header|Footer|Group|Panel)$",
      allow: ["layout", "spacing"],
    },
  ],
}

export const NO_ARBITRARY_VALUES_OPTIONS = { allow: ["layout"] }

export const RULES = {
  "shadcn-vue/no-restyle": ["error", NO_RESTYLE_OPTIONS],
  "shadcn-vue/no-raw-colors": "error",
  "shadcn-vue/no-arbitrary-values": ["error", NO_ARBITRARY_VALUES_OPTIONS],
  "shadcn-vue/no-inline-styles": "error",
  "shadcn-vue/require-static-classes": "error",
}

export const UI_RULES = {
  "shadcn-vue/no-restyle": "off",
  "shadcn-vue/require-static-classes": "off",
  "shadcn-vue/no-arbitrary-values": "off",
}

// The same rules with componentImports for a fixture whose
// components the plugin cannot find on its own, as the README's
// non-shadcn setup passes them to both rules that need them.
export function rulesFor(manifest) {
  if (!manifest?.importPattern) return RULES
  const options = { componentImports: [manifest.importPattern] }
  return {
    ...RULES,
    "shadcn-vue/no-restyle": ["error", { ...NO_RESTYLE_OPTIONS, ...options }],
    "shadcn-vue/require-static-classes": ["error", options],
  }
}

// Every named rule at one level with the documented options, for the
// scripts that measure the opt-in no-unknown-classes alongside the five.
export function rulesAt(level, names) {
  return Object.fromEntries(
    names.map((name) => {
      const id = `shadcn-vue/${name}`
      const configured = RULES[id]
      const options = Array.isArray(configured) ? configured[1] : null
      return [id, options ? [level, options] : level]
    })
  )
}
