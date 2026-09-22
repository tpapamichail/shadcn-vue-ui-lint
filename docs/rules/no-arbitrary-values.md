# no-arbitrary-values

Use theme tokens and scale values instead of values such as `p-[13px]`
or `rounded-[10px]`. The rule reports arbitrary values even when an
equivalent token or scale step exists, and suggests that equivalent.

## Setup

Allow layout values while checking appearance:

```js
"shadcn-vue/no-arbitrary-values": ["error", { allow: ["layout"] }]
```

A bare `"error"` also checks arbitrary widths, margins, and other layout
values. The [adoption setup](../adoption.md#add-more-rules) turns the rule
off inside the component directory, where structural values may be needed.

## Examples

### Tokens and scale values

With the setup above:

```vue
<!-- Allowed. -->
<div class="p-4 rounded-lg bg-primary">Account settings</div>
<div class="w-[320px]">Sidebar</div>

<!-- Reported. -->
<div class="p-[13px] rounded-[10px] bg-[#333]">Account settings</div>
```

The rule offers editor suggestions when it finds an exact scale value
or a nearby theme color. For font sizes and radii without an exact
match, it lists nearby steps.

### Scale replacements

With the default `--spacing` value of 4px, `p-[13px]` has this error:

```text
"p-[13px]" hardcodes an off-token value. Use "p-3.25" instead (same value, on the scale).
```

The replacement uses the project's spacing unit. Variants, negative
values, and important markers are preserved. Font sizes and radii use
Tailwind's defaults plus your theme declarations.

### Variants and variables

Arbitrary variants select elements or states. Variable shorthands read
CSS variables. Neither is an arbitrary value:

```vue
<!-- Allowed. -->
<div class="data-[state=open]:flex [&_svg]:size-4 bg-(--brand)" />
```

An arbitrary property such as `[padding:13px]` is an arbitrary value and
is checked. Whether a layout allowance covers it depends on its category.

### Allow an exception

Use an exact class when the design needs a specific value:

```js
"shadcn-vue/no-arbitrary-values": ["error", {
  allow: ["layout", "p-[13px]"],
}]
```

```vue
<!-- Allowed, including variant forms of the same class. -->
<div class="p-[13px] md:p-[13px]" />

<!-- Reported. -->
<div class="p-[15px]" />
```

You can also allow a category or class group. `rounded` covers the plain
radius group, not corner groups such as `rounded-t-*`.

### Contracts

To allow arbitrary widths only on Sidebar, keep the top-level list
empty and define a contract:

```js
"shadcn-vue/no-arbitrary-values": ["error", {
  contracts: [
    { pattern: "^Sidebar$", allow: ["w-*"] },
  ],
}]
```

```vue
<script setup lang="ts">
import { Button } from "@/components/ui/button"
import { Sidebar } from "@/components/ui/sidebar"
</script>

<template>
  <!-- Allowed by the contract. -->
  <Sidebar class="w-[320px]" />

  <!-- Reported. -->
  <Button class="w-[320px]">Save changes</Button>
  <Sidebar class="p-[13px]" />
</template>
```

Adding `allow: ["layout"]` at the top level would also allow the Button's
width. See [the policy](../rules.md#the-policy) for `allow`, `deny`, and
contract inheritance.

### Your own words

```js
"shadcn-vue/no-arbitrary-values": ["error", {
  allow: ["layout"],
  message: 'Use {{suggestions|a theme token or scale value}} instead of "{{className}}".',
}]
```

`{{suggestions}}` contains an exact replacement, nearby scale steps, or
nearby color tokens. `{{file}}` is the theme file. A contract can provide
its own message; editor suggestions are preserved.
See [message placeholders](../rules.md#your-own-words).

### scanAllStrings

To check strings outside recognized class sites:

```js
"shadcn-vue/no-arbitrary-values": ["error", { scanAllStrings: true }]
```

This checks every string literal in the script block, including strings
that are not used as classes. Use it only where that extra coverage is useful.

## Options

| Option           | Default           | What it does                                                              |
| ---------------- | ----------------- | ------------------------------------------------------------------------- |
| `allow`          | Not set           | Exempts matching arbitrary-value classes.                                 |
| `deny`           | Not set           | Removes exemptions. Without `allow`, exempts every other arbitrary value. |
| `contracts`      | `[]`              | Sets exceptions and messages for matching components.                     |
| `message`        | Built-in guidance | Replaces error text. Editor suggestions remain available.                 |
| `scanAllStrings` | `false`           | Checks all string literals, beyond recognized class sites.                |

The rule also accepts [recognition options](../rules.md#recognition).
See [entry matching](../rules.md#contracts) for class patterns and validation.

## Limits

- Exact spacing replacements require a px value that is a quarter-step
  multiple of the spacing unit. Other units may produce a general message.
- Font-size and radius comparisons support px and rem. Values without a
  supported scale, such as arbitrary shadows, get general guidance.
- Color suggestions use resolved light-mode values. Review whether a
  suggested token matches the design.
- Variable shorthands pass without checking that the variable is declared.
- Exceptions apply only to this rule. `no-restyle` still checks whether
  a component allows the class.

See [analysis limits](../how-it-works.md#what-it-cannot-see) for shared limits.