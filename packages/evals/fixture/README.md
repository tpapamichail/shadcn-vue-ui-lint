# Project

A shadcn/ui project (base-nova style on Base UI, Tailwind v4, CSS variables).

- UI components live in `components/ui` (button, card, badge).
- Use the `cn` helper from `@/lib/utils` to compose classes.
- Theme tokens: `bg-primary`, `bg-secondary`, `bg-muted`, `bg-accent`,
  `bg-destructive`, `text-foreground`, `text-muted-foreground`, and the
  standard Tailwind scale.
- The theme is defined in `app/globals.css`. New design tokens (e.g. a
  brand color) are added there: define the CSS variable in `:root` and
  map it in the `@theme inline` block, then use it as a utility class.
- Do not install dependencies or run any commands.
