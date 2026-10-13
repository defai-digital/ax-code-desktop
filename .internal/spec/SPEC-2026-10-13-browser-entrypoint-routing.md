# Browser Entrypoint Routing

Status: Accepted implementation specification.

1. BrowserRouting captures launcher mode/token once. Valid modes are chrome and embedded; malformed modes fail. The default is chrome unless an existing valid Desktop host token identifies the legacy embedded launcher.
2. Central MCP create blocks profiled WebMCP and unprofiled Chrome DevTools commands in embedded mode before launch/install/version preflight. Startup, add and reconnect share this path. Return blocked status and embedded-browser guidance. Unrelated MCP connections continue.
3. Desktop provider enrollment is available only in embedded mode with the existing host token. The authenticated capability response additionally attests browserMode=embedded. Regenerate SDK schema/types from the producer source.
4. Desktop injects embedded mode after bundled runtime environment resolution. Its native adapter requires both the existing native capability and embedded mode attestation before enrollment. Unsupported old workers do not gain agent browser access.
5. Test pure routing resolution, transport non-launch under startup/add/reconnect, unrelated MCP admission, Chrome-mode provider denial, Desktop environment precedence and old-worker negotiation rejection. Run each repository required gates and commit intended source only.
6. Published pins remain unchanged in this source-only task. Signed worker/SDK publication and packaged qualification are required before installed Desktop adopts the policy.
