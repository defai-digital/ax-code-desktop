# Docs source deployment

This directory is source content for AX Code Desktop public docs. This repository has no build, validation script, or
packaging workflow for it.

There is no `package.json` here, and the root `package.json` has no docs script. `.github/workflows/docs-source.yml` is
not in this repository. Nothing here validates the pages, builds a docs-source tarball, uploads a release asset, or
dispatches a website rebuild.

Rendering and hosting, when they happen, are outside this repository.
