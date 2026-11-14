# Docs source deployment

This directory is source content for AX Code Desktop public docs. Run `pnpm run docs:validate` from the repository
root before handing content to the downstream website. CI validates the source for every change.

There is no `package.json` here or `.github/workflows/docs-source.yml` in this repository. Validation does not build
a docs-source tarball, upload a release asset, or dispatch a website rebuild.

Rendering and hosting, when they happen, are outside this repository.
