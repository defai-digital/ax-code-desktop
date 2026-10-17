# AX Code runtime 7.27.0 and SDK 2.6.29 integration

The user explicitly requested checking AX Code v7.27.0 while preparing Desktop 7.27.0. The public runtime release is https://github.com/defai-digital/ax-code/releases/tag/v7.27.0 and the annotated tag resolves to `88c61f4d774ffbcb9c94438da8d109a350eb2cd0`.

All four supported runtime archives and their signatures were downloaded independently. Every size and SHA-256 matches GitHub release metadata; each Minisign signature verifies against the unchanged pinned public key `CF42FC69BEEF0EA5`. The producer comparison from 7.26.5 includes Wiki lock recovery and asynchronous system-certificate loading, with no generated SDK API or native Desktop WebMCP contract change.

JSR initially exposed only SDK 2.6.28 while the 7.27.0 runtime was already public. The producer SDK workflow subsequently completed successfully at https://github.com/defai-digital/ax-code/actions/runs/39027237840 on the same producer commit. The exact public SDK 2.6.29 archive was downloaded and its SHA-512 integrity independently verified:

`sha512-4/rN9w/kjG9whwJ7JiwHMVdMPYsRlYyZZ3FElQqla+RTSkipPPCnVpdyEqQulv68CL6xOLJgry9FnKpgP3Bluw==`

All three Desktop packages consume `jsr:@defai-digital/ax-code-sdk@2.6.29` through the frozen lockfile. No sibling source, globally installed CLI, runtime-owned Wiki renderer, or runtime-owned browser contract was modified. Final Desktop compatibility and publication claims require exact-source CI and signed native qualification; this producer verification alone does not certify the Desktop installers.
