# AX Code Desktop Docs Source

This directory is source content for AX Code Desktop public docs. Run `pnpm run docs:validate` from the repository
root to check the source. CI runs the validator for every change. This repository does not render or package the docs
website; see the [documentation index](../../../docs/README.md) for contributor references.

## Layout

- `content/docs/*.mdx` - English docs pages (source of truth)
- `sidebar.config.json` - docs navigation structure for Starlight sidebar
- `CONTRIBUTING.md` - authoring guide for adding pages and sections
- `DEPLOYMENT.md` - note that this repository does not build or publish these pages
