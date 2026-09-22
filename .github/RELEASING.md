# Releasing

Releases use [Changesets](https://github.com/changesets/changesets):

1. Run `pnpm changeset`, choose a version bump, and write a changelog
   entry. Include the generated file with your change.
2. On `main`, `release.yml` opens or updates the version PR.
3. Merging it updates the version and changelog. After type checks,
   tests, and the corpus check pass, the workflow publishes to npm
   with provenance.

Publishing uses OIDC. The npm package must list this repository and
workflow as a trusted publisher. Changesets skips packages marked
`private`; `@tpapamichail/shadcn-vue-lint` must be publishable before a
release. `packages/evals` stays private and is never versioned or
published.

Run the [install test](../CONTRIBUTING.md#install-test) before a release.
