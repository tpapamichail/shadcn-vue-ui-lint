// meta.name is the rule namespace: shadcn-vue/no-restyle.

import { noArbitraryValues } from "./rules/no-arbitrary-values"
import { noInlineStyles } from "./rules/no-inline-styles"
import { noRawColors } from "./rules/no-raw-colors"
import { noRestyle } from "./rules/no-restyle"
import { noUnknownClasses } from "./rules/no-unknown-classes"
import { requireStaticClasses } from "./rules/require-static-classes"

export const rules = {
  "no-restyle": noRestyle,
  "no-raw-colors": noRawColors,
  "no-arbitrary-values": noArbitraryValues,
  "no-inline-styles": noInlineStyles,
  "require-static-classes": requireStaticClasses,
  "no-unknown-classes": noUnknownClasses,
}

export const plugin = {
  meta: { name: "shadcn-vue" },
  rules,
}
