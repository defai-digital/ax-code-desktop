# Match custom permission patterns to the SDK contract

Status: bounded configuration correctness repair.

The pinned public SDK 2.6.37 and runtime schema declare seven permission fields as actions only, while the custom-pattern picker currently offers every permission name. It can therefore construct a map for a field that accepts only Allow/Ask/Deny. Their ordinary wildcard/default controls already support setting those actions.

1. Reproduce the unsupported WebFetch choice with mounted and native UI tests.
2. Filter action-only permissions from the custom-pattern picker while retaining their existing wildcard/action controls. Keep generic and unknown tool patterns supported by the SDK catchall.
3. Type-check the small capability projection against the exact published PermissionConfig type, including completeness, so SDK drift fails compilation rather than silently changing the UI contract. No runtime schema copy or sibling modification.
4. Verify native absence of unsupported choices, positive pattern workflows, and WebFetch action edit/reset. Run focused UI tests, type checking, lint and build, inspect screenshots, and commit scoped evidence.
