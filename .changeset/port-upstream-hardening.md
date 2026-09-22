---
"@tpapamichail/shadcn-vue-lint": patch
---

Port framework-agnostic hardening from upstream `@shadcn/lint` 0.2.0: classes declared in a component's own `<style>` block no longer report as unknown; barrel-defined variants (`buttonVariants` in `index.ts` beside `Button.vue`) are found; `index.js` barrels are read for SFC directories; components re-exported through `componentImports` are named by their SFC filename; `.vue` modules parse only their script blocks and strip comments in export lists; a warning fires when a `.vue` file is linted without `vue-eslint-parser`.
