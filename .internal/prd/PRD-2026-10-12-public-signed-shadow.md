# Public Signed Desktop Qualification

Status: Accepted under the user's public-release authorization, signature requirements
and request to repair failed Actions job 114634431835.

The repository is now public. Required-signature qualification must run without
requiring private source visibility. Public runs must reject unsigned mode before
building, require all configured signing credentials, and sign each artifact before
its first upload. Official releases, tags, updater cutover, R2 publication and the
original platform/migration qualification gates remain separate.

Acceptance: acknowledged public required-signature runs pass the visibility check;
public unsigned and unknown-visibility runs fail; all four platform/web staging jobs
apply Minisign before upload; Apple notarization and Windows Authenticode audits
remain mandatory in required mode; official publication remains disabled.
