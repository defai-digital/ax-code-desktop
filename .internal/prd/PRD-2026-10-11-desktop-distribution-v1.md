# Desktop Distribution v1

Status: Accepted for preparation; public release disabled.
Date: 2026-10-11

The Desktop installer must be available without GitHub credentials while source
remains private. The user selected `https://download.automatosx.com/ax-code-desktop/`
and explicitly retired Windows ARM64. Supported targets are macOS 13+ Apple
Silicon, Windows x64, and Ubuntu Desktop 24.04+ x64/ARM64. Existing application
identity, credentials and user data must survive installation and rollback.

Preparation includes platform matrix changes, cross-platform package fixes and
a reviewable installation/distribution design. It does not waive signed shadow,
upgrade, rollback, continuity or human release-cutover gates.
