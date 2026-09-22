import { describe, test } from "vitest"

import { requireStaticClasses } from "../src/rules/require-static-classes"
import { button, cn, createTester, PAGE, sfc } from "./helpers"

const tester = createTester()
const rule = requireStaticClasses as any

describe("require-static-classes", () => {
  test("rule", () => {
    tester.run("require-static-classes", rule, {
      valid: [
        {
          filename: PAGE,
          code: sfc(button, `<Button class="mt-4">Go</Button>`),
        },
        // The component's own received class is sanctioned: the parent
        // authors it, so this file cannot check it.
        {
          filename: PAGE,
          code: sfc(
            `${button}\n${cn}\nconst on = true\nconst props = defineProps<{ class?: string }>()`,
            `<Button :class="cn('mt-4', on && 'w-full', props.class)">Go</Button>`
          ),
        },
        {
          filename: PAGE,
          code: sfc(
            `${button}\n${cn}\nconst on = true`,
            `<Button :class="cn({ 'w-full': on })">Go</Button>`
          ),
        },
        // One hop resolves a same-file constant, so it is static.
        {
          filename: PAGE,
          code: sfc(
            `${button}\nconst layout = "mt-4"`,
            `<Button :class="layout">Go</Button>`
          ),
        },
        // Plain elements are out of scope, however dynamic the value.
        {
          filename: PAGE,
          code: sfc(`const cls = getClasses()`, `<div :class="cls" />`),
        },
      ],
      invalid: [
        // Nothing in the file binds it, so the template cannot read it.
        {
          filename: PAGE,
          code: sfc(button, `<Button :class="cls">Go</Button>`),
          errors: [{ messageId: "dynamicClasses" }],
        },
        // A member of a v-for item is a value only the render knows.
        {
          filename: PAGE,
          code: sfc(
            button,
            `<Button v-for="item in items" :class="item.cls">Go</Button>`
          ),
          errors: [{ messageId: "dynamicClasses" }],
        },
        {
          filename: PAGE,
          code: sfc(button, `<Button :class="\`p-\${size}\`">Go</Button>`),
          errors: [{ messageId: "dynamicClasses" }],
        },
        {
          filename: PAGE,
          code: sfc(
            `${button}\n${cn}`,
            `<Button :class="cn('mt-4', extra)">Go</Button>`
          ),
          errors: [{ messageId: "dynamicClasses" }],
        },
        {
          filename: PAGE,
          code: sfc(button, `<Button :class="makeClasses()">Go</Button>`),
          errors: [{ messageId: "dynamicClasses" }],
        },
        // A reassigned variable is not resolvable.
        {
          filename: PAGE,
          code: sfc(
            `${button}\nlet c = "mt-4"\nc = "bg-red-500"`,
            `<Button :class="c">Go</Button>`
          ),
          errors: [{ messageId: "dynamicClasses" }],
        },
      ],
    })
  })
})
