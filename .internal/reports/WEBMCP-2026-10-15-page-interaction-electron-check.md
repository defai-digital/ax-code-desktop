# WebMCP: page interaction checked in a real Electron window

Date: 2026-10-15

## What was run

A scratch Electron 44.7.0 main process (not committed) created a real `WebContentsView` on a loopback
HTTP page, attached the repository's real `NativeWebMcp` adapter, and drove `read`, `act` and `wait`
through `adapter.execute()` exactly as the provider stream does. The page had a link, a text input, a
password input holding a value, a select, a button that fills a paragraph after 400 ms, and a second page.

## Result

| Step | Observed |
| --- | --- |
| `read` | Title, visible text and a 5-entry outline; the password value was absent and the link query string was stripped |
| `act` type / select | The page's input and select held the typed and chosen values |
| `act` type on the password field | Refused with `not-typable` |
| `act` click, then `wait` for the new text | `found: true` |
| `act` click on a link | `navigated: true`, new generation, pane on the second page |
| `act` with the old read | Refused as stale; a new `read` on the new page worked |

## Defect found and fixed

`executeJavaScriptInIsolatedWorld` resolves with the script's value, not an array. The adapter destructured
an array, which only the unit-test fakes (which also returned arrays) tolerated. The adapter and the fakes
now use the real shape.

## Not verified

The full path through a packaged app and a signed runtime that sends these operations is still untested:
the runtime change is not in a published release. Layout-dependent behaviour on heavy commercial pages
(trip.com) is untested.
