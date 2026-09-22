# Adding linting to an existing project

Start with one rule. Fix the common violations, then add more checks.
You can set each rule's severity and choose which files it checks.

Use the [README setup](../README.md#get-started) first. The examples below
use ESLint; keep its plugin and parser configuration.

## Start with warnings

Set `no-restyle` to `warn` in the main `rules` object:

```js
"shadcn-vue/no-restyle": ["warn", { allow: ["layout"] }]
```

This keeps layout classes allowed, as in the README. Keep the
component-directory override, then run:

```bash
npx eslint .
```

Look for repeated errors, such as padding on buttons. Fix those patterns
before working through individual files.

## Limit the warning count

Use the measured count in your lint script. For example, if the project
has 287 warnings:

```json
{
  "scripts": {
    "lint": "eslint . --max-warnings 287"
  }
}
```

Run this script in CI. It fails when the total increases. Lower the cap
as you fix findings.

For a baseline per file and rule, ESLint also has
[bulk suppressions](https://eslint.org/docs/latest/use/suppressions).
They apply to errors, not warnings. `eslint --suppress-all` records
existing violations; `eslint --prune-suppressions` removes resolved entries.

## Keep new code strict

You can enforce a rule in new code while leaving legacy code at `warn`.
Add these objects after the main ESLint config object and before the
component-directory override:

```js
{
  files: ["app/**/*.vue", "features/**/*.vue"],
  rules: { "shadcn-vue/no-restyle": ["error", { allow: ["layout"] }] },
},
{
  files: ["legacy/**/*.vue"],
  rules: { "shadcn-vue/no-restyle": ["warn", { allow: ["layout"] }] },
},
```

To exempt a folder, turn off the specific rule there. Other lint checks
still run:

```js
{ files: ["marketing/**/*.vue"], rules: { "shadcn-vue/no-restyle": "off" } }
```

## Fix findings

- Use an existing variant for a component's appearance.
- Use a contract when callers should control part of its styling.
- Use suggested tokens or scale values when they match the design.
- Review new tokens and variants before adding them.

For example, a title can allow typography through a contract:

```js
"shadcn-vue/no-restyle": ["warn", {
  allow: ["layout"],
  contracts: [
    { pattern: "^CardTitle$", allow: ["layout", "typography"] },
  ],
}]
```

```vue
<template>
  <CardTitle class="text-sm">Account settings</CardTitle>
</template>
```

A contract overrides the keys it writes and inherits the rest, so a
contract that writes `allow` restates `layout` when the component
should keep it. See
[Configuring your design system](./design-systems.md) for help choosing variants and contracts.

## Add more rules

When a rule is clean, change it to `error`. Add other rules at `warn`
first, then promote each one as you resolve its findings. A configuration
with all five core rules enabled looks like this:

```js
rules: {
  "shadcn-vue/no-restyle": ["error", { allow: ["layout"] }],
  "shadcn-vue/no-raw-colors": "error",
  "shadcn-vue/no-arbitrary-values": ["error", { allow: ["layout"] }],
  "shadcn-vue/no-inline-styles": "error",
  "shadcn-vue/require-static-classes": "error",
}
```

Update the component-directory override too. Components own their
appearance and may need structural values such as `ring-[3px]`:

```js
{
  files: ["components/ui/**/*.vue"],
  rules: {
    "shadcn-vue/no-restyle": "off",
    "shadcn-vue/no-arbitrary-values": "off",
    "shadcn-vue/require-static-classes": "off",
  },
}
```

Adjust the path to your component directory. `no-raw-colors` and
`no-inline-styles` stay enabled inside it.

Add [`no-unknown-classes`](./rules/no-unknown-classes.md) separately, at
`warn` first. Classes supplied by other stylesheets may need an `allow`
entry. Remove `--max-warnings` once all enabled rules are errors.

## Agents

Add your lint command to `package.json`, then put this in `AGENTS.md`:

```md
After making changes, run `npm run lint` and fix all errors.
```

Review new tokens, variants, and exceptions in the resulting changes.

## Exceptions

Document an intentional exception next to the code:

```vue
<template>
  <!-- eslint-disable-next-line shadcn-vue/no-raw-colors -- Partner brand color, approved by design. -->
  <span class="bg-amber-400">Sponsor</span>
</template>
```

`rg "eslint-disable.*shadcn-vue/"` finds these comments. You can require a
reason with `require-description` from
`@eslint-community/eslint-plugin-eslint-comments`.
