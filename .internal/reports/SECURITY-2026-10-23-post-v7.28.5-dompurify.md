# Post-v7.28.5 DOMPurify dependency hardening

Status: fixed on main; not included in the immutable v7.28.5 release. A later version needs separate authorization and its own signed exact-source qualification.

## Discovery and affected release

The dependency-alert snapshot at 2026-10-23T06:02:07Z contained zero open alerts. GitHub ingested three DOMPurify alerts at 06:23:02-03Z. They were discovered during the final repository push/readback after v7.28.5 was published at 06:42:55Z. The original snapshot records its observation time; it is not a claim that the published release has no subsequently reported vulnerabilities.

The released source is `ed7e89c4fb3c131866365a93397b647b835ddfd2`. Its direct UI sanitizer already uses DOMPurify 3.4.17, but Mermaid resolves a separate 3.4.16 through the older workspace override. Treat the published dependency inventory as affected by these advisories:

- [GHSA-cg2g-xh64-v4q7](https://github.com/advisories/GHSA-cg2g-xh64-v4q7): critical; template sanitization involving DOM output and shadow-root content.
- [GHSA-mrv2-3pqr-j5jr](https://github.com/advisories/GHSA-mrv2-3pqr-j5jr): high; in-place hooks can leave detached related nodes unsanitized.
- [GHSA-c6gr-qvv4-5v3f](https://github.com/advisories/GHSA-c6gr-qvv4-5v3f): low; XHTML parsing can miss an SVG animation attribute guard.

All three identify 3.4.17 as patched. The application defaults do not explicitly enable the affected modes, but Mermaid accepts diagram-level configuration. Absence of those flags in application source does not establish that diagram-controlled configurations are unreachable. The direct final sanitizer and image isolation are mitigating layers, not a proof that every upstream path is unexploitable. No exploitability exclusion or alert dismissal is claimed.

## Fix and verification

Raise the workspace override from `dompurify@<3.4.16: 3.4.16` to `dompurify@<3.4.17: 3.4.17`. The lock removes the 3.4.16 package/snapshot and changes Mermaid's resolved edge to 3.4.17. All other dependency entries, application code, runtime/SDK pins and Mermaid capability declarations remain unchanged.

- Frozen installation and UI typecheck passed.
- Full UI suite: 4,978 tests passed across 661 files.
- Desktop build: all three tasks passed.
- Native Mermaid smoke passed SVG and PNG rendering/export, stylesheet and fragment isolation, and the 181-node flowchart check.
- Both direct UI and Mermaid dependency resolution, and the built web bundle, contain only DOMPurify 3.4.17.
- Actual bounded Grok CLI and Claude Code CLI reviews found no lock/override compatibility blocker. Their configuration-reachability reporting caveat is incorporated above.

Evidence is retained under `.internal/releases/v7.28.5-post-release-dompurify/` with the reviewed diff and log hashes. The dependency fix is committed at `47993fd3379cec95cd5abde4ebcd7d92f8b8975b`; this supporting record is a separate documentation commit. The committed dependency diff matches the exact diff tested and reviewed. This validation does not qualify a new public release version.

## Publication boundary

The v7.28.5 tag, 126 assets, signatures and update pointers are not overwritten. Main's corrected dependency graph must not be described as remediating those published binaries. A separate version, such as v7.28.6, requires the explicit per-version authorization in AGENTS.md and fresh release qualification. No new version has been approved by this record.
