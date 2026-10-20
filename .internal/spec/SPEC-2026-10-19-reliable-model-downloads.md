# Reliable model download contract

Status: Implemented and locally validated; not released.
Authority: Maintainer request on 2026-10-19 to plan, implement, test and commit the reviewed download fixes and a synchronized model/download documentation page.

## Scope and order

1. AX Code: preserve structured Engine failure diagnostics ahead of stderr warnings; bound and redact messages; cover generic and MTP summaries and legacy fallback.
2. AX Code: retain global environment sanitization, narrowly forward user HF credentials only to the official Hub, suppress implicit cached credentials for custom endpoints, preserve selected cache paths.
3. AX Engine: use actionable Hub failure classification in the real snapshot exception path, redact secrets and expose additive machine failure details without changing existing summary fields. Never silently retry authorization failures anonymously.
4. Desktop: use the existing bounded login-shell capture to populate only model-download environment variables for the main-supervised runtime. Preserve explicit launcher values and keep raw shell env and secrets out of logs and the renderer.
5. AX Code docs: generate a public collection/download-source page from recorded HF metadata and a reviewed R2 inventory. Support publisher-triggered and scheduled refreshes through reviewable PRs; no automatic runtime-admission change or merge.
6. Run focused regressions first, then required package/script/type/boundary gates, and commit scoped changes in each repository.

## R2 policy

HF remains the download source. R2 inventory starts empty because no signed, exact-revision model mirror has been qualified in this task. Do not invent model URLs or assert R2 throughput superiority. Publish only verified mirrors with exact source revisions and provenance; the page must show missing or stale R2 availability honestly. Cloud uploads, mirroring weights, activating a new download backend, or release publication require concrete verified artifacts and are outside this bug-fix delivery. A future R2 transport must use signed file manifests, SHA-256, safe resume, atomic activation and origin-scoped credentials; it must preserve current cache and model contracts.

## Acceptance

Public downloads remain account-optional. Warning-only stderr cannot replace structured errors. Unrelated provider secrets remain stripped. Custom HF endpoints receive neither forwarded nor implicit cached HF credentials. Engine auth, rate-limit, revision, network and disk errors stay distinct. Desktop inherits only approved model env values. Docs regeneration is deterministic offline; online changes produce a reviewable proposal. Existing dirty work is preserved. No weight download is required for tests.
