// require-static-classes: what the collector cannot read is invisible to
// every other rule, so it is a violation of its own. The component's own
// received class is the one sanctioned opaque value.

import { classSiteVisitors } from "../sites/collect"
import { reporter } from "./messages"
import { recognitionSchema } from "./policy-schema"
import { withSettings } from "./settings"

const MESSAGES = {
  dynamicClasses:
    "Dynamically built class on <{{component}}> cannot be checked. Use static class strings.",
}

export const requireStaticClasses = {
  meta: {
    type: "problem" as const,
    docs: {
      description:
        "Require statically analyzable class values on design-system components.",
      url: "https://github.com/tpapamichail/shadcn-vue-ui-lint/blob/main/docs/rules/require-static-classes.md",
    },
    schema: [
      {
        type: "object",
        properties: {
          message: { type: "string", maxLength: 500 },
          ...recognitionSchema,
        },
        additionalProperties: false,
      },
    ],
    messages: MESSAGES,
  },
  create(context: any) {
    const options = withSettings(context, context.options?.[0] ?? {})
    const emit = reporter(context, MESSAGES, {
      rule: "shadcn-vue/require-static-classes",
      message: options.message,
    })
    return classSiteVisitors(context, options, (site) => {
      if (!site.component) return
      for (const node of site.unresolved) {
        emit({
          node,
          messageId: "dynamicClasses",
          data: { component: site.component },
        })
      }
    })
  },
}
