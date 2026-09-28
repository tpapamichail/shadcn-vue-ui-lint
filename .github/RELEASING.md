# Releasing

Releases use [Changesets](https://github.com/changesets/changesets). The
repository's default and release branch is `master`.

## First publish

Trusted publishing cannot be configured until the package exists on npm.
Bootstrap the initial release once from a clean checkout:

1. Sign in to npm as an account allowed to publish under `@hosterai`
   (`npm login`), and check with `npm whoami`. Complete any 2FA prompt locally;
   never put an npm token in this repository.
2. Run `pnpm install --frozen-lockfile`, `pnpm build`, and the
   [install test](../CONTRIBUTING.md#install-test).
3. Publish the version in `packages/lint/package.json` with
   `npm publish ./packages/lint --access public`.
4. On npmjs.com, configure `@hosterai/shadcn-vue-lint` to trust the GitHub
   Actions workflow `tpapamichail/shadcn-vue-ui-lint` / `release.yml` for
   publishing. Verify that this trusted publisher is enabled before merging
   a version PR.

The first manual publish cannot have GitHub Actions provenance; subsequent
releases use OIDC and provenance. `packages/evals` is private and is never
published.

## Subsequent releases

1. Run `pnpm changeset`, choose a version bump, and include the generated
   changelog entry with the change.
2. On `master`, `release.yml` opens or updates the version PR.
3. Merging that PR publishes after type checks, tests, and the corpus check.
   Check the published version and provenance on npmjs.com.

Run the [install test](../CONTRIBUTING.md#install-test) before a release.
