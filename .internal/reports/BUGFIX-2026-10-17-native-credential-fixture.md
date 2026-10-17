# Native credential fixture and notarization transport corrections

The first signed shadow of candidate `de8c4837dbda5ca6828c8fff99f7d7ec1e1a0107` failed on two distinct qualification steps. Its successful Linux receipts do not qualify a later source candidate.

On Windows, the installed candidate passed CLI/ASAR smoke and reached GUI runtime health plus first paint. The subsequent strict continuity assertion detected changed synthetic `auth.json` bytes. The fixture had been written as plaintext without the runtime encryption canary. AX Code's normal first auth read migrates this form, encrypting the API credential and creating its canary. This is an expected runtime-owned migration, not evidence that the installer erased credentials.

An isolated reproduction using the public, Minisign-verified runtime 7.26.5 and `AX_CODE_TEST_HOME` confirmed that the first read changes the synthetic file, the second read preserves its bytes, and the canonical non-secret auth export still reports a readable API credential for the qualification provider. No real credentials or primary profile were used.

The qualifier now invokes the staged signed runtime's `providers auth export` before capturing continuity hashes. It requires the synthetic API credential to be readable and a second runtime read to preserve canonical bytes and POSIX metadata. Every subsequent installer, CLI and Windows GUI step retains the original strict byte/metadata continuity assertions. There is no new Desktop crypto implementation, hash rebasing after GUI startup, migration exception or ignored continuity failure. Regressions reject a missing credential and an unstable second read; a direct integration with verified runtime 7.26.5 confirms canonical migration and stable re-reading.

On macOS, Apple notarization accepted submission `9da91d1f-3e63-451c-ad3a-a368632910cc`, but CloudKit ticket delivery lost its network connection (NSURLErrorDomain -1005) and stapler exited 68. The staple command now uses the existing bounded CI network retry helper. Separate stapler validation, Gatekeeper assessment, code-sign verification, native installation and migration remain mandatory. No signature or notarization rejection is waived.

The corrected qualification source requires fresh exact-source CI, CodeQL and signed four-platform shadow evidence before publication.

## Complete fixture initialization

Candidate `6612b0797572148d7b9ac8f7c469ca35044044f7` passed CI and CodeQL, but its Windows GUI continuity check next detected a configuration rewrite. The observed hash `e152cb3dac44712b394a360d001749c559f6a8994a472c9668ef2b5763714644` exactly matches the official runtime's sole insertion of `$schema` into the original empty provider fixture. An isolated signed-runtime `debug config` reproduction confirmed that no setting was lost and that a fixture containing the official schema reference remains byte-identical across repeated reads. The initial synthetic configuration now includes that canonical reference.

The same candidate's macOS fixture preparation could not find its synthetic provider. Earlier packaged GUI smoke may already create an empty canary-only auth store; create-if-absent correctly preserved that file but did not seed a qualification credential. Fixture preparation now accepts only a missing file or a regular, empty/canary-only store. It refuses to replace any store containing a provider, never prints its contents, and delegates all encryption/canary generation to the signed runtime. Regressions cover empty-store initialization and refusal to overwrite an existing credential. An isolated integration first creates a genuine canary-only store with the signed runtime, then prepares the fixture and verifies readable credentials, stable encrypted bytes and stable canonical configuration. Installer and post-GUI continuity assertions remain unchanged.

The macOS signing, notarization, stapling and audit step itself passed on that candidate. Its incomplete native evidence does not qualify the corrected fixture source; a new exact-source shadow is required.
