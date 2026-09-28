# @hosterai/shadcn-vue-lint

**Write design system rules that agents can verify.**

`@hosterai/shadcn-vue-lint` is an [agent-first linter](#built-for-agents) for Tailwind design systems in Vue.

It is a Vue port of [`@shadcn/lint`](https://github.com/shadcn-ui/lint), the same linter for React: the same rules, options, and agent-facing messages, retargeted from JSX to Vue single-file components.

You define what’s allowed. When an agent breaks a rule, the error explains what’s wrong and suggests a fix based on your components, variants, and theme.

**Works with your existing design system. No rewrite required.**

`@hosterai/shadcn-vue-lint` works with Tailwind v4 projects (**shadcn-vue not required**). Available for **ESLint**, with `vue-eslint-parser`.

## Table of contents

- [Quickstart](#quickstart)
- [TypeScript vs @hosterai/shadcn-vue-lint](#typescript-vs-hosterai-shadcn-vue-lint)
- [Built for agents](#built-for-agents)
- [Get started](#get-started)
- [Nuxt setup](#nuxt-setup)
- [Links in Vue and Nuxt](docs/link.md)
- [Rules](#rules)
- [Configuration](#settings)

## Quickstart

Give your coding agent this prompt:

```text
Read https://github.com/tpapamichail/shadcn-vue-ui-lint/blob/master/SETUP.md
and set up @hosterai/shadcn-vue-lint in this project.
```

Once installed, [choose your rules](#rules) and configure what’s allowed
in your design system.

Prefer to configure it yourself? See [Get started](#get-started).

## TypeScript vs @hosterai/shadcn-vue-lint

Take a Button that allows margin and width, but controls its own padding.
You can enforce that with types by typing its `style` prop as
`Pick<CSSProperties, "margin" | "width">`, using `CSSProperties` from
`vue`.

```vue
<template>
  <Button :style="{ padding: '16px' }">Submit</Button>
</template>
```

```text
TS2353: Object literal may only specify known properties, and 'padding' does not exist in type 'Pick<CSSProperties, "margin" | "width">'.
```

The rule works. But this error only tells the agent that padding is not
allowed. It doesn’t tell it how to size the Button.

With `@hosterai/shadcn-vue-lint`, the same rule comes with **guidance from your design
system**:

```vue
<template>
  <Button class="p-4">Submit</Button>
</template>
```

```text
"p-4" is not allowed on <Button>: <Button> owns its spacing.
Use a size (sm, lg), or margin here or gap on the parent for space around it.
Add a size in components/ui/button/Button.vue only if the design explicitly calls for one.
```

### You decide what can change

Expressing these policies in TypeScript can take complex types. With
`@hosterai/shadcn-vue-lint`, you configure them without changing your component API.

Here are some examples.

**Allow spacing with margin. Allow full width. Keep size and shape in the Button.**

```js
"shadcn-vue/no-restyle": ["error", {
  allow: ["layout"],
  contracts: [
    { pattern: "^Button$", allow: ["w-full", "mt-*", "mb-*"] },
  ],
}]
```

```vue
<template>
  <!-- Allowed: use a size and let the page control placement and full width. -->
  <Button size="lg" class="mt-4 md:w-full" />

  <!-- Error: you are not allowed to change padding and shape. -->
  <Button class="p-4 hover:rounded-full" />

  <!-- Error: you are not allowed to set a custom height or fixed width. -->
  <Button class="md:h-12 w-48" />
</template>
```

**Give each part of a component its own rules.**

Let Card titles change typography, but keep their font family and weight.
Let Card content change spacing, but keep its typography.

```js
"shadcn-vue/no-restyle": ["error", {
  allow: ["layout"],
  contracts: [
    {
      pattern: "^CardTitle$",
      allow: ["layout", "typography"],
      deny: ["font-*"],
    },
    { pattern: "^CardContent$", allow: ["layout", "spacing"] },
  ],
}]
```

```vue
<template>
  <!-- Allowed: titles can change text size; content can change padding. -->
  <CardTitle class="text-lg" />
  <CardContent class="p-6" />

  <!-- Error: you are not allowed to change the title’s font weight. -->
  <CardTitle class="md:font-bold" />

  <!-- Error: you are not allowed to change the content’s typography. -->
  <CardContent class="text-lg" />
</template>
```

**Allow spacing changes. Require theme values.**

Opening up spacing doesn’t have to mean allowing arbitrary values.
Combine rules to let Card content change padding while keeping it on your
theme’s spacing scale.

```js
"shadcn-vue/no-restyle": ["error", {
  allow: ["layout"],
  contracts: [
    { pattern: "^CardContent$", allow: ["layout", "spacing"] },
  ],
}],
"shadcn-vue/no-arbitrary-values": "error",
```

```vue
<template>
  <!-- Allowed: padding uses the theme’s spacing scale. -->
  <CardContent class="p-6 md:p-8" />

  <!-- Error: you are not allowed to use an arbitrary padding value. -->
  <CardContent class="md:p-[13px]" />
</template>
```

Both approaches enforce the rule. With `@hosterai/shadcn-vue-lint`, the agent also sees
how to fix the code using what’s already in your design system.

## Built for agents

We built `@hosterai/shadcn-vue-lint` for agents that write UI. The errors tell them
what broke, what to use instead, and where to find it. Suggestions come from your components, variants, and theme.

You can add
[custom messages](#custom-messages) and [contracts](#contracts) so agents
get your design system’s instructions with the error.

### It works

We tested these rules with coding agents across more than 150 task runs. Almost every task reached zero violations in one correction round.

These numbers are historical: they were measured on the React original, `@shadcn/lint`, before this port targeted Vue SFCs. The rules and the feedback they produce are unchanged.

Here are the errors before and after lint feedback in one run per model:

| Model         | Completed tasks | Errors before | Errors after |
| ------------- | --------------: | ------------: | -----------: |
| Sonnet 5      |             8/8 |            69 |            0 |
| Haiku 4.5     |             8/8 |            66 |            0 |
| Opus 5        |             8/8 |            42 |            0 |
| GPT 5.6 Terra |             8/8 |           117 |            0 |
| GPT 5.6 Sol   |             6/8 |            98 |            0 |

### It is cheaper

In the Claude control runs, fixing violations with lint feedback cost
**10% to 48% less** than with rules alone.

See the [evals](https://github.com/tpapamichail/shadcn-vue-ui-lint/blob/master/docs/evals.md) for results and methodology.

## Why a linter?

A linter is [programmable](#programmable). You can write rules for your design system
without changing your components.

You define what’s allowed and what to use instead. Agents run your lint
command to check their work.

- **Ship the same components with different rules.** Each project can
  define its own contracts without changing the component code.
- **Use components you don’t own.** Apply rules to components from
  third-party packages. No forks. No wrappers.
- **Share rules across projects.** Keep a shared configuration for your
  design system and let projects add their own rules.

Your components stay flexible. You decide how they should be used.

## Programmable

### Custom messages

You can write custom error messages that tell agents what to do.

```js
"shadcn-vue/no-restyle": ["error", {
  allow: ["layout"],
  message: {
    spacing: "Use the size prop instead of padding.",
  },
}]
```

When an agent writes:

```vue
<template>
  <Button class="p-4">Save changes</Button>
</template>
```

It sees:

```text
Use the size prop instead of padding.
```

### Placeholders

Use your component’s sizes, variants, and file paths in error messages.
For spacing errors, `{{sizes}}` lists the available sizes:

```js
"shadcn-vue/no-restyle": ["error", {
  allow: ["layout"],
  message: {
    spacing: "Use a {{component}} size: {{sizes}}.",
  },
}]
```

For a Button with `sm` and `lg` sizes, the error becomes:

```text
Use a Button size: sm, lg.
```

You can also tell agents where to find theme colors. For example, in
`no-raw-colors`:

```js
message: "Use a theme color from {{file}}."
```

If your theme is in `src/index.css`, the error becomes:

```text
Use a theme color from src/index.css.
```

See all [message placeholders](https://github.com/tpapamichail/shadcn-vue-ui-lint/blob/master/docs/rules.md#your-own-words).

### Contracts

Give each component its own rules. For example, let pages change a card
title's typography:

```js
"shadcn-vue/no-restyle": ["error", {
  allow: ["layout"],
  contracts: [
    { pattern: "^CardTitle$", allow: ["layout", "typography"] },
  ],
}]
```

```vue
<template>
  <!-- Allowed by the contract. -->
  <CardTitle class="text-sm">Account settings</CardTitle>

  <!-- Reported: the contract does not allow color overrides. -->
  <CardTitle class="text-pink-500">Account settings</CardTitle>
</template>
```

See [contracts and custom messages](https://github.com/tpapamichail/shadcn-vue-ui-lint/blob/master/docs/design-systems.md).

## Get started

The example below enables `no-restyle` and allows layout classes such as
`mt-4` and `w-full`.

Requires Node.js 20.19 or later.

### ESLint

Requires ESLint 9.30 or later. Vue files need `vue-eslint-parser`, with
the TypeScript parser for their script blocks.

```bash
npm install -D @hosterai/shadcn-vue-lint eslint vue-eslint-parser @typescript-eslint/parser
```

Create `eslint.config.mjs`. If your framework already configures ESLint,
keep its parser setup and add the plugin and rule.

```js
import { plugin as shadcnVue } from "@hosterai/shadcn-vue-lint"
import tsParser from "@typescript-eslint/parser"
import vueParser from "vue-eslint-parser"

export default [
  {
    files: ["**/*.vue"],
    languageOptions: {
      parser: vueParser,
      parserOptions: { parser: tsParser, sourceType: "module" },
    },
    plugins: { "shadcn-vue": shadcnVue },
    rules: {
      "shadcn-vue/no-restyle": [
        "error",
        {
          allow: ["layout"],
        },
      ],
    },
  },
]
```

```bash
npx eslint .
```

Add `eslint .` as the `lint` script in `package.json`. Then put this in
`AGENTS.md`:

```md
After making changes, run `npm run lint` and fix all errors.
```

## Nuxt setup

Use the Nuxt ESLint module's existing flat config; do not replace its
Vue parser with a separate ESLint config. Requires Node.js 20.19+,
ESLint 9.30+, and Tailwind v4.

If the project does not already use `@nuxt/eslint`, add it first:

```bash
npx nuxi module add eslint
```

Install the linter in the Nuxt app (npm example):

```bash
npm install -D @hosterai/shadcn-vue-lint eslint@^9.30.0
```

In your existing `eslint.config.mjs`, append a config to Nuxt's
`withNuxt(...)`. Keep any other configs, rules, and ignores you already
have:

```js
import { plugin as shadcnVue } from "@hosterai/shadcn-vue-lint"

import withNuxt from "./.nuxt/eslint.config.mjs"

export default withNuxt({
  files: ["**/*.vue"],
  plugins: { "shadcn-vue": shadcnVue },
  settings: { "shadcn-vue": { componentPrefix: "Ui" } },
  rules: {
    "shadcn-vue/no-restyle": ["error", { allow: ["layout"] }],
  },
})
```

The `componentPrefix` above is for shadcn-nuxt setups that register
`Button` as the auto-imported `<UiButton>` (`shadcn.prefix: "Ui"`).
Use your project's actual prefix, or omit the setting if components
are not prefixed. `components.json` should point `aliases.ui` to the
UI directory; the rule needs that directory to recognize auto-imported
components and suggest their variants.

Nuxt 4 projects with UI files under `app/components/ui` often have a
root `tsconfig.json` containing `references` to `.nuxt` configs rather
than `paths`. If `components.json` uses `"ui": "@/components/ui"`,
add these paths to the **existing** root `tsconfig.json` without
removing its `files` or `references`:

```jsonc
"compilerOptions": {
  "paths": {
    "@/*": ["./app/*"],
    "~/*": ["./app/*"]
  }
}
```

This maps `@/components/ui` to `app/components/ui`. For a different
directory, use the matching paths; projects with a resolvable alias
need no extra mapping. Run `npm exec -- nuxt prepare` if Nuxt has not
generated `.nuxt/eslint.config.mjs`, then run `npx eslint .` (or the
project's `npm run lint`). To confirm the rule is active, temporarily
put `class="p-4"` on an existing `<UiButton>` and lint that `.vue`
file: `shadcn-vue/no-restyle` should report the override. Remove the
temporary class afterward.

In Zed, open the Nuxt project root with its Vue extension installed
and restart the ESLint language server after changing the config.
`eslint --fix` only fixes rules that provide a safe fix; `no-restyle`
requires choosing the appropriate component variant or contract.

## Rules

We developed these rules by studying production design systems and testing
them with coding agents. They’re built for Tailwind, with errors that help
agents follow your design system.

| Rule                                                                                                                            | What it catches                                                        |
| ------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| [`no-restyle`](https://github.com/tpapamichail/shadcn-vue-ui-lint/blob/master/docs/rules/no-restyle.md)                         | Restyling a component with `class`.                                    |
| [`no-raw-colors`](https://github.com/tpapamichail/shadcn-vue-ui-lint/blob/master/docs/rules/no-raw-colors.md)                   | Raw colors such as `bg-pink-500`.                                      |
| [`no-arbitrary-values`](https://github.com/tpapamichail/shadcn-vue-ui-lint/blob/master/docs/rules/no-arbitrary-values.md)       | Arbitrary values such as `p-[13px]`.                                   |
| [`no-inline-styles`](https://github.com/tpapamichail/shadcn-vue-ui-lint/blob/master/docs/rules/no-inline-styles.md)             | Inline styles such as `style="color: red"`.                            |
| [`no-unknown-classes`](https://github.com/tpapamichail/shadcn-vue-ui-lint/blob/master/docs/rules/no-unknown-classes.md)         | Classes Tailwind cannot generate, such as `rounded-huge`.              |
| [`require-static-classes`](https://github.com/tpapamichail/shadcn-vue-ui-lint/blob/master/docs/rules/require-static-classes.md) | Component classes the linter cannot read, such as `` `bg-${color}` ``. |

See [rule options](https://github.com/tpapamichail/shadcn-vue-ui-lint/blob/master/docs/rules.md) and [how to add more rules](https://github.com/tpapamichail/shadcn-vue-ui-lint/blob/master/docs/adoption.md#add-more-rules).

## Settings

Use `settings["shadcn-vue"]` to configure component imports, class
functions, and guidance shared across rules.

**You don’t need shadcn-vue to use `@hosterai/shadcn-vue-lint`. It works with your own
Tailwind components and theme.**

shadcn-vue projects get automatic component and theme discovery via
`components.json`.

For a custom setup, add `settings` to the config object containing your
rules. Include only the settings you need:

```js
settings: {
  "shadcn-vue": {
    ui: "@/ds",
    componentImports: ["^@acme/ui(/|$)"],
    componentPrefix: "Ui",
    ignoreImports: ["^@acme/ui/internal(/|$)"],
    mergeFunctions: ["customMerge"],
    variantFunctions: ["variants"],
    note: "See DESIGN.md for design rules and approved exceptions.",
  },
},
```

| Setting            | What it does                                                                                                                                 |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `ui`               | Recognizes component imports by prefix. `@/ds` matches `@/ds` and `@/ds/button`, but not `@/dsx`.                                            |
| `componentImports` | Recognizes component imports using regex patterns. Use it for additional directories or packages.                                            |
| `ignoreImports`    | Skips component recognition for imports matching these regex patterns. Takes precedence over recognition.                                    |
| `componentPrefix`  | Recognizes auto-imported components registered under a name prefix, as Nuxt's `Ui`: `<UiButton>` is the project's `Button`. A single string. |
| `mergeFunctions`   | Adds functions whose arguments contain classes, such as `customMerge("mt-4", "w-full")`.                                                     |
| `variantFunctions` | Adds functions whose object values contain classes.                                                                                          |
| `note`             | Appends your text to every rule's error or warning.                                                                                          |

All settings except `note` and `componentPrefix` accept a string or an
array of strings. `note` and `componentPrefix` accept a string.

`componentPrefix` names one prefix, the one a component registration puts
in front of every name. Set it to the same prefix your framework is
configured with, such as Nuxt's `components: [{ path: "~/components/ui",
prefix: "Ui" }]`. Only a name the project's own component directory owns
answers, so `<UiNotAComponent>` is still nobody's component. Findings,
contracts and variant hints speak of the unprefixed name.

The built-in class functions are `cn`, `cx`, `clsx`, `cva`, `tv`,
`twMerge`, `twJoin`, and `classNames`. The built-in variant functions
are `cva` and `tv`. Your function lists add to these defaults.

A recognition option set on a rule overrides its shared setting.
`ui` prefixes always apply alongside `componentImports`. Recognition
settings do not apply to `no-inline-styles`; `note` applies to every rule.

When you change the component directory, update the setup's directory
override too, for example `src/ds/**/*.vue`.
See [rule options](https://github.com/tpapamichail/shadcn-vue-ui-lint/blob/master/docs/rules.md#recognition) for more examples.

### Monorepos

Use your workspace package's import prefix for shared components.
For a UI package in `packages/ui`, add this to the config from the setup
above:

```js
import { plugin as shadcnVue } from "@hosterai/shadcn-vue-lint"
import tsParser from "@typescript-eslint/parser"
import vueParser from "vue-eslint-parser"

export default [
  {
    files: ["**/*.vue"],
    languageOptions: {
      parser: vueParser,
      parserOptions: { parser: tsParser, sourceType: "module" },
    },
    plugins: { "shadcn-vue": shadcnVue },
    settings: { "shadcn-vue": { ui: "@workspace/ui/components" } },
    rules: {
      "shadcn-vue/no-restyle": ["error", { allow: ["layout"] }],
    },
  },
  {
    files: ["packages/ui/src/components/**/*.vue"],
    rules: { "shadcn-vue/no-restyle": "off" },
  },
]
```

Apps can use the shared components:

```vue
<script setup lang="ts">
import { Button } from "@workspace/ui/components/button"
</script>

<template>
  <Button class="w-full">Save changes</Button>
</template>
```

These paths assume your lint config is at the workspace root.

The linter resolves components through your apps' TypeScript paths and
package exports. If each app's `components.json` already points to the
shared UI package, you can omit `settings["shadcn-vue"].ui`. Each app
keeps its own theme configuration.

## Documentation

See the [documentation](https://github.com/tpapamichail/shadcn-vue-ui-lint/blob/master/docs/README.md) for rule examples, configuration,
troubleshooting, and evals.

## Contributing

Please read the [contributing guide](https://github.com/tpapamichail/shadcn-vue-ui-lint/blob/master/CONTRIBUTING.md).

## License

Licensed under the [MIT license](https://github.com/tpapamichail/shadcn-vue-ui-lint/blob/master/LICENSE).
