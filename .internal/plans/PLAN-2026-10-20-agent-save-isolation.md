# Agent editor save isolation

Status: implementation plan under the existing Settings and parallel-project quality requirements.

Mounted form tests reproduce three failures: delayed update completion modifies another project's same-name agent baseline; leaving and returning accepts an earlier visit's completion; delayed creation clears another project's draft. Same-form in-flight edits and immediate clean state already pass.

1. Scope completion to the submitting form generation (project, selection, draft, and mount lifetime).
2. Preserve permission configuration, save normalization, in-flight edits, and existing clean-state behavior.
3. Replace the old name-only source assertion with mounted behavioral evidence; run focused tests, UI type checking, lint, and final build.
4. Continue native WebMCP exploration of nested Commands/Agents forms and visually inspect resulting screenshots. Distinguish native discovery from controlled asynchronous component tests.
5. Record evidence and commit scoped changes, preserving unrelated runtime-pin/reference work.

Native Commands exploration found that both execution selectors expose the identical accessible name `Not selected`, despite visible labels `Override Agent` and `Override Model`. Add an optional localized field label to the shared selectors and use it in Commands, preserving the selected value in the accessible name. Verify native discovery and both picker actions without relying on element order. Other consumers keep their current names.

Visual inspection of the new native journey found a confirmed narrow-layout defect: at an 800px viewport, the three-column Settings view leaves a narrow command editor, but viewport `sm:` rules force horizontal rows and clip name/agent/model controls. Existing root-overflow checks missed it. Use the editor container width for row layout and wrap the name/scope controls. Add explicit native bounds checks for the affected fields before accepting a screenshot pass.
