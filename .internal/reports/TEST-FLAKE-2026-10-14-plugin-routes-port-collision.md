# Test flake: `plugin-routes.test.js` 401 / socket hang up

Date: 2026-10-14

## Symptom

`desktop/packages/web/server/lib/ax-code/plugin-routes.test.js` fails intermittently with a
transport-level error on a request that should have reached the express app under test:

- `Error: expected 200 "OK", got 401 "Unauthorized"` — observed on
  `GET /api/config/plugins`, `GET /api/config/plugins/registry`, and
  `POST /api/config/plugins/file` (expected 409) in different runs;
- `Error: socket hang up` — observed on `DELETE /file/:id unlinks file`.

The affected test and endpoint vary between runs, which pointed at the transport rather than
at any assertion.

## Investigation

- Alone: `plugin-routes.test.js` ran 60 consecutive times with 0 failures.
- Under load: running it in a loop while other vitest processes covered the web package
  reproduced it once in 80 runs (and a concurrent 3× full-suite run produced one
  `socket hang up` in the same file).
- Decisive evidence: a temporary middleware in the test app logged every response with
  status ≥ 400 together with its headers and socket ports. Our own expected 4xx responses
  appear there (`x-powered-by: Express`, adjacent local/remote ports). The failing 401
  produced **no log line at all** — the express app under test never served that request,
  so the client spoke to a different listener on the local host.

## Conclusion

Not a defect in the plugin routes or in the test's assertions. It is a local-host port
artifact: many concurrent test processes bind ephemeral ports, and a supertest client can
occasionally connect to a foreign listener (a local server answering 401) or have its
connection dropped. Nothing in the route handlers can produce this.

## Recommendation

Do not treat it as a product bug and do not weaken the assertions. Confirm by re-running the
file in isolation (60/60 passed here). If it becomes noisy in CI, give this file its own
vitest process instead of changing the test.

The diagnostic middleware used for this investigation was removed; nothing from it is
committed.
