# Native credential fixture and notarization transport corrections

The first signed shadow of candidate `de8c4837dbda5ca6828c8fff99f7d7ec1e1a0107` failed on two distinct qualification steps. Its successful Linux receipts do not qualify a later source candidate.

On Windows, the installed candidate passed CLI/ASAR smoke and reached GUI runtime health plus first paint. The subsequent strict continuity assertion detected changed synthetic `auth.json` bytes. The fixture had been written as plaintext without the runtime encryption canary. AX Code's normal first auth read migrates this form, encrypting the API credential and creating its canary. This is an expected runtime-owned migration, not evidence that the installer erased credentials.

An isolated reproduction using the public, Minisign-verified runtime 7.26.5 and `AX_CODE_TEST_HOME` confirmed that the first read changes the synthetic file, the second read preserves its bytes, and the canonical non-secret auth export still reports a readable API credential for the qualification provider. No real credentials or primary profile were used.

The qualifier now invokes the staged signed runtime's `providers auth export` before capturing continuity hashes. It requires the synthetic API credential to be readable and a second runtime read to preserve canonical bytes and POSIX metadata. Every subsequent installer, CLI and Windows GUI step retains the original strict byte/metadata continuity assertions. There is no new Desktop crypto implementation, hash rebasing after GUI startup, migration exception or ignored continuity failure. Regressions reject a missing credential and an unstable second read; a direct integration with verified runtime 7.26.5 confirms canonical migration and stable re-reading.

On macOS, Apple notarization accepted submission `9da91d1f-3e63-451c-ad3a-a368632910cc`, but CloudKit ticket delivery lost its network connection (NSURLErrorDomain -1005) and stapler exited 68. The staple command now uses the existing bounded CI network retry helper. Separate stapler validation, Gatekeeper assessment, code-sign verification, native installation and migration remain mandatory. No signature or notarization rejection is waived.

The corrected qualification source requires fresh exact-source CI, CodeQL and signed four-platform shadow evidence before publication.
