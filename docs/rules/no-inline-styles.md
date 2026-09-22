# no-inline-styles

Use classes for styling. Pass dynamic values through CSS custom properties
when a class needs them. This rule reports ordinary inline properties,
hardcoded colors in custom properties, and unreadable style objects.

## Setup

```js
"shadcn-vue/no-inline-styles": "error"
```

Keep this rule enabled inside your component directory too. It checks
every element in a template and does not need component import settings.

## Examples

### Classes and custom properties

```vue
<!-- Allowed. -->
<div class="text-primary">Account settings</div>
<div class="text-(--label-color)" style="--label-color: var(--color-primary)" />

<!-- Reported: an ordinary inline property. -->
<div style="color: var(--color-primary)">Account settings</div>

<!-- Reported: a hardcoded color in a custom property. -->
<div style="--label-color: #ec4899">Account settings</div>
```

The rule reports each disallowed property separately. A static `style`
string is judged property by property, the way a class would be. A
`:style` binding is read as an object:

```vue
<script setup lang="ts">
const props = defineProps<{ width: number }>()
</script>

<template>
  <div
    class="w-(--panel-width)"
    :style="{ '--panel-width': `${props.width}px` }"
  />
</template>
```

The rule reads `style`, `:style`, and a `style` property inside a
`v-bind="{ ... }"` spread.

Custom properties are checked for colors, not every kind of hardcoded
value. Hex colors, named colors, color functions, and colors in gradients
or shadows are reported. Theme variable references pass.

### Variables and style objects

The rule reads same-file objects and lookup values one hop deep:

```vue
<script setup lang="ts">
const colors = { accent: "#ec4899" }
</script>

<template>
  <!-- Reported: the lookup contains a raw color. -->
  <div :style="{ '--label-color': colors.accent }" />
</template>
```

An imported object, unknown function call, unreadable spread, or mutated
object is reported as a dynamic style value:

```vue
<script setup lang="ts">
import { panelStyle } from "./styles"
</script>

<template>
  <!-- Reported: the object cannot be checked here. -->
  <div :style="panelStyle" />
</template>
```

### Forwarded style props

A component can forward the `style` it received:

```vue
<script setup lang="ts">
const { style } = defineProps<{ style?: string }>()
</script>

<template>
  <div :style="style" />
</template>
```

A local object named `style` is still checked. Defaults for the received
prop are also checked, including one written with `withDefaults`, because
they are defined in the current file.

### Allow an exception

For a property controlled by an animation library:

```js
"shadcn-vue/no-inline-styles": ["error", { allow: ["transform"] }]
```

```vue
<!-- Allowed. -->
<div :style="{ transform: 'translateX(10px)' }" />

<!-- Reported. -->
<div :style="{ color: 'red' }" />
```

Use CSS property names, not Tailwind classes. `backgroundColor` and
`background-color` match the same property. `border-*` matches a family;
`--*` matches every custom property.

An allowed property is not checked further, including for hardcoded
colors. Use narrow exceptions when possible.

### Contracts

A contract can allow a property on one component:

```js
"shadcn-vue/no-inline-styles": ["error", {
  contracts: [
    { pattern: "^Motion$", allow: ["transform"] },
  ],
}]
```

```vue
<!-- Allowed by the contract. -->
<Motion :style="{ transform: 'translateX(10px)' }" />

<!-- Reported: the contract does not apply to div. -->
<div style="transform: translateX(10px)" />
```

This rule matches the component tag as written. It does not resolve
wrappers to their underlying component. Lowercase and kebab-case tags are
intrinsic elements and use the top-level policy. See
[contract inheritance](../rules.md#contracts).

### Your own words

```js
"shadcn-vue/no-inline-styles": ["error", {
  message: 'Use a class instead of {{property|inline CSS}}.',
}]
```

For `:style="{ color: 'red' }"`:

```text
Use a class instead of color.
```

`{{property}}` uses the source spelling, such as `backgroundColor`.
It is empty for unreadable style objects, so provide a fallback.
`{{component}}` is empty on intrinsic elements.

## Options

| Option      | Default           | What it does                                                       |
| ----------- | ----------------- | ------------------------------------------------------------------ |
| `allow`     | Not set           | Exempts CSS properties from inline-style checks.                   |
| `deny`      | Not set           | Removes exemptions. Without `allow`, exempts every other property. |
| `contracts` | `[]`              | Sets property exceptions and messages for matching components.     |
| `message`   | Built-in guidance | Replaces error text.                                               |

A `deny` list can also report custom properties that would otherwise
pass. Invalid entries such as `bg-red-500` produce a configuration error.
This rule has no [recognition options](../rules.md#recognition).

## Limits

- Imported style values are reported as unreadable rather than inspected.
- Forwarding a received `style` prop is allowed. Its authored defaults
  and any local properties added alongside it are checked.
- Only a static `style` attribute is split into declarations. A `:style`
  binding that carries a plain string is an unreadable style object.
- A Button contract does not apply to a wrapper named SaveButton.

See [analysis limits](../how-it-works.md#what-it-cannot-see) for shared limits.