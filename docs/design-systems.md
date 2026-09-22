# Configuring your design system

Use variants for appearances you want to reuse. Use contracts to define
which styling changes a page can make.

Start with the [setup](../README.md#get-started). For an existing
codebase, follow [Adding linting to an existing project](./adoption.md).

## Variants

Use a variant for a named appearance that callers should reuse:

```vue
<Button variant="destructive">Delete</Button>
```

If an existing variant fits, use it. When the design needs a new treatment,
add it to the component. For example, a brand variant can use these tokens:

```css
@theme {
  --color-brand: #ec4899;
  --color-brand-foreground: #fff;
}
```

Add this entry to the Button's existing `cva` `variant` definition:

```js
brand: "bg-brand text-brand-foreground hover:bg-brand/90"
```

Then use it by name:

```vue
<Button variant="brand">Subscribe</Button>
```

The linter reads the new variant and can suggest it in later findings.

## Contracts

Use a contract when callers should control part of a component's styling.
For example, titles might accept typography while avatars accept only size.

Set `no-restyle` in your config's `rules` object:

```js
"shadcn-vue/no-restyle": ["error", {
  allow: ["layout"],
  contracts: [
    { pattern: "^CardTitle$", allow: ["layout", "typography"] },
    { pattern: "(Content|Footer)$", allow: ["layout", "spacing"], deny: ["p-0", "px-0"] },
    { pattern: "^Avatar$", allow: ["size-*"] },
  ],
}]
```

- `pattern` matches component names with a regex.
- `allow` is the complete list of what the component accepts. Include
  `layout` if callers may place it.
- `deny` rejects classes `allow` would otherwise cover.

The top-level settings apply to components without a matching contract.
A contract replaces the keys it writes and inherits the rest from those
settings. If several contracts match, only the last one applies.
Entries can be categories (`spacing`), class groups (`bg-color`), or
patterns (`size-*`).

With these contracts:

```vue
<!-- Passes. -->
<CardTitle class="text-sm">Account settings</CardTitle>
<Avatar class="size-8" />

<!-- Reports a contract violation. -->
<Avatar class="w-full" />
<CardContent class="px-0" />
```

Add spacing allowances for containers whose padding and gap belong to the page. For example:

```js
{ pattern: "^Card$|(Content|Header|Footer|Group|Panel)$", allow: ["layout", "spacing"] }
```

Contracts do not bypass other rules. Allowing padding on a component
still leaves `p-[13px]` subject to `no-arbitrary-values`.
See [Contracts](./rules.md#contracts) for matching details and limits.

## Custom messages

Write guidance that explains your team's decisions. A contract can use
one message for all findings, or a different message for each category:

```js
{
  pattern: "^Button$",
  allow: ["layout"],
  deny: ["w-*"],
  message: {
    layout: "Set width on the parent container.",
    spacing: "Use a Button size: {{sizes|none defined}}.",
    default: "Use a Button variant: {{variants|none defined}}.",
  },
}
```

For `<Button class="w-full">`, the message is:

```txt
Set width on the parent container.
```

Placeholders use the component's actual names and values. The other five
rules also accept a `message` option. See
[Your own words](./rules.md#your-own-words) for placeholders and examples.

To append a note to every rule's findings, set `settings["shadcn-vue"].note`,
for example `"See docs/design-rules.md for approved exceptions."`. See
[Your own words](./rules.md#your-own-words) for the full settings block.

## Share a policy

Keep the rule settings in one file and read them from every config that
needs them. Put `rules` in `design-system.lint.json`:

```json
{
  "rules": { "shadcn-vue/no-restyle": ["error", { "allow": ["layout"] }] }
}
```

In the [ESLint setup](../README.md#eslint), import the policy and use
`policy.rules` for the main config object's rules. The component-directory
override stays a config object of its own:

```js
// With the imports from the setup above.
import policy from "./design-system.lint.json" with { type: "json" }

export default [
  {
    files: ["**/*.vue"],
    languageOptions: {
      parser: vueParser,
      parserOptions: { parser: tsParser, sourceType: "module" },
    },
    plugins: { "shadcn-vue": shadcnVue },
    rules: policy.rules,
  },
  {
    files: ["components/ui/**"],
    rules: { "shadcn-vue/no-restyle": "off" },
  },
]
```

The plugin requires Node.js 20.19 or later, which supports this import
syntax. ESLint reads `settings` from the config object that applies to a
file, so keep the shared settings next to the plugin registration.

## Review changes

Run lint in CI and make it part of [agent instructions](./adoption.md#agents).
Review new tokens, variants, contracts, and suppression comments as design
decisions. Lint checks the configured rules; it cannot decide whether a new
appearance belongs in the system.
