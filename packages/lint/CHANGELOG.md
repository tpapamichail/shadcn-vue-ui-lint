# @hosterai/shadcn-vue-lint

## 0.2.0

### Minor Changes

- [`431abc7`](https://github.com/tpapamichail/shadcn-vue-ui-lint/commit/431abc7ab96724f4ec7f32d0cb0ed4b7f3022ec8) Thanks [@tpapamichail](https://github.com/tpapamichail)! - Recognize auto-imported components registered under a name prefix. `settings["shadcn-vue"].componentPrefix: "Ui"` (or the same option on a rule) makes `<UiButton>` the project's own `Button` and `<ui-card-title>` its `CardTitle`, including inside a project wrapper on disk; without it, a framework that auto-imports (Nuxt, shadcn-nuxt) leaves the whole design system invisible, because no import names a component. Only a name the project's own UI directory owns answers, so `<UiNotAComponent>` stays unrecognized, and findings, contracts, and variant hints speak of the unprefixed name.

### Patch Changes

- [`5f7587e`](https://github.com/tpapamichail/shadcn-vue-ui-lint/commit/5f7587ed1d06aaee1bd3cd2229bdffbf25a3d037) Thanks [@tpapamichail](https://github.com/tpapamichail)! - Port framework-agnostic hardening from upstream `@shadcn/lint` 0.2.0: classes declared in a component's own `<style>` block no longer report as unknown; barrel-defined variants (`buttonVariants` in `index.ts` beside `Button.vue`) are found; `index.js` barrels are read for SFC directories; components re-exported through `componentImports` are named by their SFC filename; `.vue` modules parse only their script blocks and strip comments in export lists; a warning fires when a `.vue` file is linted without `vue-eslint-parser`.

- [`03ac295`](https://github.com/tpapamichail/shadcn-vue-ui-lint/commit/03ac295b1e4a8ec6bc9b48e80b2a9dc8ed731916) Thanks [@tpapamichail](https://github.com/tpapamichail)! - The templates-unread warning now links to this repository's setup docs instead of the React original's.

## 0.1.0

- Initial release — Vue port of `@shadcn/lint`.

### Ported upstream history

The port carries these upstream `@shadcn/lint` changes from 0.1.1 through 0.1.5:

- 0.1.1 — Read Astro `class:list` and `render` props as class sites, classify Tailwind 3 utility names, resolve variant names through a type alias and a props union, and fix `no-raw-colors` reporting declared tokens as colors, theme imports from pnpm-linked packages, base utilities behind a partial `tailwind.css`, and `no-restyle` naming components after minified exports or calling a declared `@utility` class a misspelling.
- 0.1.2 — Fix theme reading past comments, scoped color namespaces, `exports` patterns, plain selectors hiding raw colors, and the TypeScript parser peer warning.
- 0.1.3 — Read a destructured binding's own slot of its initializer, and resolve a ui package's alias to its own name.
- 0.1.4 — Read a project's animations from its CSS: an `animate-*` class classifies as motion when the theme declares `--animate-<name>` or the CSS declares it, so the result no longer depends on cn grouping every `animate-*` name.
- 0.1.5 — Update the bundled cn grammar to 0.3.2: axis utilities such as `px-2` conflict with the logical sides they cover, and only Tailwind's own `animate-*` names share the `animate` group.
