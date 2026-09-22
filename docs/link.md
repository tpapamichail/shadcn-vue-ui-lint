# Links in Vue and Nuxt

shadcn-vue does not provide a separate `Link` component in the current
component registry, so there is no `shadcn-vue add link` command to run. Use
the router component supplied by your framework for internal navigation, and
use a native `<a>` for external URLs. Install the shadcn-vue `Button` component
only when you want a link styled as a button.

## Vue

### Install the styled link dependency

Initialize shadcn-vue if the project is not already configured, then add the
`Button` component:

```bash
pnpm dlx shadcn-vue@latest init
pnpm dlx shadcn-vue@latest add button
```

For npm or yarn, use the equivalent `npx` or `yarn dlx` command.

If Vue Router is not already installed and configured, add it first with
`pnpm add vue-router`. If the app does not use client-side routing, use a
native `<a href="...">` instead.

### Internal navigation

Use `RouterLink` from Vue Router. A plain router link needs no shadcn-vue
component:

```vue
<template>
  <RouterLink to="/dashboard">Dashboard</RouterLink>
</template>
```

To use the shadcn-vue link style, render `RouterLink` through the Button
component's `link` variant:

```vue
<script setup lang="ts">
import { Button } from "@/components/ui/button"
</script>

<template>
  <Button as-child variant="link">
    <RouterLink to="/dashboard">Dashboard</RouterLink>
  </Button>
</template>
```

`as-child` keeps `RouterLink` as the rendered element, so router navigation
and link semantics remain intact.

## Nuxt

### Install the Nuxt integration and styled link dependency

For a Nuxt project, install the official Nuxt module first:

```bash
pnpm dlx nuxi@latest module add shadcn-nuxt
pnpm dlx shadcn-vue@latest add button
```

Ensure `nuxt.config.ts` contains the module and component directory used by
the project:

```ts
export default defineNuxtConfig({
  modules: ["shadcn-nuxt"],
  shadcn: {
    prefix: "",
    componentDir: "@/components/ui",
  },
})
```

If the project uses a different prefix or component directory, keep those
existing values and adjust the import path below.

### Internal navigation

Use Nuxt's `NuxtLink` for internal routes:

```vue
<template>
  <NuxtLink to="/dashboard">Dashboard</NuxtLink>
</template>
```

For the shadcn-vue link style:

```vue
<script setup lang="ts">
import { Button } from "@/components/ui/button"
</script>

<template>
  <Button as-child variant="link">
    <NuxtLink to="/dashboard">Dashboard</NuxtLink>
  </Button>
</template>
```

Do not replace `NuxtLink` with a plain `<a href>` for internal routes. Keeping
`NuxtLink` preserves client-side navigation and Nuxt's route handling.

## External links

Use a native anchor in both Vue and Nuxt:

```vue
<template>
  <a href="https://example.com" target="_blank" rel="noopener noreferrer">
    Open the external site
  </a>
</template>
```

Use descriptive link text, and add `target="_blank"` only when opening a new
tab is intentional.

## Choosing the element

| Destination                                 | Vue                                                  | Nuxt                                               |
| ------------------------------------------- | ---------------------------------------------------- | -------------------------------------------------- |
| Internal route                              | `RouterLink`                                         | `NuxtLink`                                         |
| External URL                                | `<a href="...">`                                     | `<a href="...">`                                   |
| Internal route with shadcn-vue link styling | `Button as-child variant="link"` around `RouterLink` | `Button as-child variant="link"` around `NuxtLink` |

See the official [shadcn-vue Button documentation](https://www.shadcn-vue.com/docs/components/button),
[Vue installation guide](https://www.shadcn-vue.com/docs/installation/vite), and
[Nuxt installation guide](https://www.shadcn-vue.com/docs/installation/nuxt)
for the upstream component and framework setup.
