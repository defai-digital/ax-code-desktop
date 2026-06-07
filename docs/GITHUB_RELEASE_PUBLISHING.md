# GitHub release publishing

Use the guarded publish script from the repository root:

```bash
bun run publish:github -- --version 0.8.0
```

Before running it, bump the package versions, add the matching
`CHANGELOG.md` section, and commit those changes. The script intentionally does
not edit source files during publishing; it validates that the prepared release
commit is safe to tag.

That first run is a dry-run preflight. It validates package versions,
`CHANGELOG.md`, Git state, GitHub authentication, minisign key availability,
docs, tests, type-checking, linting, and build output. It does not create a tag
or mutate GitHub.

When the dry run passes, publish:

```bash
bun run publish:github -- --version 0.8.0 --publish
```

The publish path:

1. Verifies the worktree is clean and `HEAD` matches the release branch on
   `origin`.
2. Verifies the local and remote `v<version>` tag do not already exist.
3. Verifies the GitHub Release does not already exist.
4. Runs `bun run docs:validate`, `bun run test`, `bun run type-check`,
   `bun run lint`, and `bun run build`.
5. Probes the minisign key in `~/signkey` before pushing the tag.
6. Creates and pushes the annotated `v<version>` tag.
7. Waits for `.github/workflows/release.yml` to finish.
8. Downloads the published release assets.
9. Signs each asset with `scripts/minisign-artifacts.sh`.
10. Uploads the generated `.minisig` files back to the GitHub Release.
11. Verifies the release is public and every signed asset has a matching
    `.minisig`.

If the GitHub workflow succeeds but local minisign upload fails, rerun only the
signature upload step:

```bash
bun run publish:github -- --version 0.8.0 --signatures-only --publish
```

Use `--skip-signing` only for emergency releases where detached minisign
signatures are intentionally not being published. Use `--skip-local-validation`
only after the same validation commands have already passed on the exact commit
being tagged.
