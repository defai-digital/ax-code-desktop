# Desktop Download Distribution v4: Qualified Multipart Updates

Status: Implementation addendum within the existing ADR-012 publication policy.
Date: 2026-10-13
Previous accepted contracts: distribution v2/v3 and public Desktop release cutover.

The existing active public channel needs qualified updates whose immutable
installers exceed the 300 MiB REST limit. `upload-multipart` uses the same pinned
key, exact signed inventory, source SHA, five qualification gates, four native
platform receipts, and isolated authenticated multipart Worker as `stage-multipart`.
It does not change signing authority, ownership, serving policy, or routes.

Before mutation, snapshot all verified source bytes. Require an active Desktop
gateway for updates; retain the disabled-gateway requirement for staging. Stage
only immutable version objects, including readiness last. Verify authenticated
R2 bytes and every anonymous immutable object before updating any root alias.
Publish bootstrap aliases and signatures next, with latest/signature last. Verify
the resulting public snapshot and retain a credential-free receipt. Always remove
the task-owned upload Worker, and abort an incomplete multipart upload.

REST updates must use authoritative storage for collision and missing-object
checks, enforce the size limit before mutation, and verify both R2 and public
bytes. A source-directory change during network upload cannot change snapshot
contents. Existing immutable objects with different bytes remain refused.

The v7.25.0 native qualification baseline is the previous public Desktop 7.24.5.
Its four exact installer hashes and Minisign signatures were independently
verified before repinning the qualification fixtures. Exercise fresh candidate,
baseline, upgrade, rollback, and final candidate installation on disposable hosted
runners; compare profile/configuration hashes and POSIX ownership/permissions.
Historical 7.10.2 evidence remains unchanged.
