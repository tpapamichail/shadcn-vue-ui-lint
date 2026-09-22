# @tpapamichail/shadcn-vue-lint

## 0.1.0

- Initial release — Vue port of `@shadcn/lint`.

### Ported upstream history

The port carries these upstream `@shadcn/lint` changes from 0.1.1 through 0.1.5:

- 0.1.1 — Read Astro `class:list` and `render` props as class sites, classify Tailwind 3 utility names, resolve variant names through a type alias and a props union, and fix `no-raw-colors` reporting declared tokens as colors, theme imports from pnpm-linked packages, base utilities behind a partial `tailwind.css`, and `no-restyle` naming components after minified exports or calling a declared `@utility` class a misspelling.
- 0.1.2 — Fix theme reading past comments, scoped color namespaces, `exports` patterns, plain selectors hiding raw colors, and the TypeScript parser peer warning.
- 0.1.3 — Read a destructured binding's own slot of its initializer, and resolve a ui package's alias to its own name.
- 0.1.4 — Read a project's animations from its CSS: an `animate-*` class classifies as motion when the theme declares `--animate-<name>` or the CSS declares it, so the result no longer depends on cn grouping every `animate-*` name.
- 0.1.5 — Update the bundled cn grammar to 0.3.2: axis utilities such as `px-2` conflict with the logical sides they cover, and only Tailwind's own `animate-*` names share the `animate` group.
