---
"@hosterai/shadcn-vue-lint": minor
---

Recognize auto-imported components registered under a name prefix. `settings["shadcn-vue"].componentPrefix: "Ui"` (or the same option on a rule) makes `<UiButton>` the project's own `Button` and `<ui-card-title>` its `CardTitle`, including inside a project wrapper on disk; without it, a framework that auto-imports (Nuxt, shadcn-nuxt) leaves the whole design system invisible, because no import names a component. Only a name the project's own UI directory owns answers, so `<UiNotAComponent>` stays unrecognized, and findings, contracts, and variant hints speak of the unprefixed name.
