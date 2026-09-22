# Changesets

This folder is managed by [changesets](https://github.com/changesets/changesets).

To record a change that should ship in the next release:

```bash
pnpm changeset
```

Pick the bump and describe the change. The description becomes the
CHANGELOG entry. Commit the generated markdown file with your change.

See the [release guide](../.github/RELEASING.md) for how changesets are
versioned and published.
