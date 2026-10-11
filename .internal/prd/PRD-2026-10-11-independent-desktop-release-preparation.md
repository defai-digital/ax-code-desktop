# PRD: Independent Desktop Release Preparation

Status: Accepted for preparation under the user's 2026-10-11 instruction to correct release problems.
Production cutover remains blocked until the existing signed-shadow, continuity, rollback, and human gates pass.

The Desktop repository must prepare releases for `defai-digital/ax-code-desktop` using `v<desktop-version>`.
Desktop versions are independent of the separately verified AX Code runtime pin. Existing application identity,
credentials, source provenance, data paths, public runtime verification, and prior release tags remain intact.
Preparation must expose missing evidence instead of marking an unsigned candidate as an official release.

Acceptance: stable exact Electron pin, coherent Desktop package versions, explicit future release target,
read-only release readiness report, working independent workspace validation commands, cross-platform shadow
packaging evidence, and no public publication or active updater change before qualified cutover.
