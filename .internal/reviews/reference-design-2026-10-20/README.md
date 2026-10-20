# Reference-design advisory review

Read-only CLI review of the comparison and proposed PRD. Reviewers received the curated English
[input](review-input.md), not filesystem access. Tools, shell/web access and delegation were disabled by the command
configuration. Outputs are advisory and are not competitor execution, visual QA or product approval.

| Reviewer | Receipt | Result |
| --- | --- | --- |
| Muse | [status](muse.status.json), [output](muse.txt) | Exit 0, 19.8 seconds; three substantive findings |
| Grok | [status](grok.status.json), [output](grok.txt) | Exit 1, 11.8 seconds; preamble only, maximum turn count reached |
| Grok bounded retry | [status](grok-retry.status.json), [output](grok-retry.txt) | 120.4-second timeout, exit 143; no substantive output |

The initial Grok call allowed one turn; the retry allowed two and added the first instruction in the saved input to
request a direct review. Neither Grok attempt counts as completed substantive review or approval. The process group
was terminated on the retry deadline. No further retries were started.

## Independent disposition of Muse findings

1. **Occurrence contract prerequisite:** accepted as a clarification. The proposal already assigned missing facts to the
   runtime, but RS-07 now expressly requires producer tracing and forbids Desktop-minted canonical state/IDs. No claim
   is made that the pinned SDK supplies all fields.
2. **Recap freshness and evidence:** checked against SDK 2.6.37 (`text`, `time`, `scope`, no revision/evidence binding).
   The first increment now explicitly labels an unverified saved summary until freshness semantics are established.
   Offline reading, late-response isolation and accessible full text remain required.
3. **Qualification levels:** accepted with correction. Distinguish backend, build/profile and observation method.
   The suggestion to test Desktop's developer adapter in a packaged build conflicts with its intentional package
   exclusion. Qualify that adapter in development and the user-project browser workflow on its intended package
   separately; one cannot qualify the other.

The [source manifest](source-manifest.json) records 24 reference files inspected independently of the reviewers.
Each working-copy file matched its recorded committed Git blob. Local links in the new documents and whitespace were
checked; reference test files were read, not executed. No competitor app was launched in this comparison.
