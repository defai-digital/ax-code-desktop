# Code scanning review for 7.26.2

The initial live default-branch inventory contained nine open alerts: 94 through 102. The exact baseline SARIF was saved with release operator evidence.

- 94: remove the error-handler fallback to the unvalidated request path. A failed canonicalization cannot trigger a subsequent stat of raw input.
- 95 and 96: resolve Git state paths and their metadata root through realpath, compare both lexical and canonical boundaries, and reject escaping/dangling symlinks. A real conflicted rebase with its state moved outside `.git` is covered by regression.
- 97 and 98: canonicalize the requested repository-discovery directory and home before selecting the ancestor ceiling or accessing children. Reject null bytes. Repository browsing intentionally supports explicit absolute folders outside home, stopping upward discovery at that folder.
- 100: remove the unused CLI fileSize helper.
- 101: remove an overwritten migration variable initializer.
- 102: remove an overwritten passkey-store assignment while retaining the initial loadStore call and its initialization/password-binding effects; re-read the store after asynchronous verification.
- 99: the authenticated editor intentionally saves request text to a workspace/approved path after symlink checks. This is the same intended data flow previously reviewed as false positive in alert 28, now reported again after the merge. Preserve the editor and its path checks; disposition must explicitly record this as a false positive, not claim arbitrary editor text was sanitized or a security defect fixed.

Fresh CodeQL on the final candidate and on main is required to verify alert resolution. A passing workflow alone is not evidence of zero open alerts.

The first fresh branch analysis (`39014345051`, source `960599ad36cbc45c2df272b5fb22b156be1be8af`) removed the original path findings but reported two new canonicalization sinks. Alert 104 exposed a remaining unnecessary dependence on the requested repository root when interpreting `--absolute-git-dir`; require Git to return an absolute metadata directory instead of joining it or falling back. Alert 103 tracks only realpath of the project chooser's explicitly requested absolute folder. Arbitrary folder selection is the purpose of this local project picker; only directory/repository hints are returned, with a canonical ancestor ceiling. It is an intentional selection boundary, not an escaping content-read path. Its disposition is a documented false positive; no query or source path is excluded from CodeQL.
