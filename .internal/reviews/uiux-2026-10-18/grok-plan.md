The five findings are valid against this snapshot. Keep the work inside these components and the existing actions. No new permission mode, navigation destination, or runtime.

### Unsupported claims

- The permission control sends `"once"` and is labeled with `notificationCenter.allow`. The words “Allow once” are not in the snapshot. Do not add an always-grant action; the card comment reserves that for the in-session card.
- Titlebar, Needs You, and Mission Control peek appear only in that comment. Change `RequestActionCard` once, then verify real callers.
- No live-sidebar source is included. Share status only if that view already renders `SupervisionState`.
- Error uses `text-destructive` on Mission Control and `--status-error` on Compare. Their equality is not shown.
- Compare currently paints review as success and running as info. Mission Control is the reverse: review is info, running is a success dot. The proposed map matches Mission Control and would change Compare.
- The header already passes `label` into Mission Control. Icon-only is unproven without `HeaderIconActionButton`.
- No control is named “session workspace.” “Review changes” already exists as beside-chat `diff`.
- Header panel controls are not duplicated in the header. Terminal also exists on the rail; both follow bottom-terminal state. Keep the dock.
- Rows use viewport `sm:`, not container width. Density, container queries, and the grid that owns j/k arrows are absent here.
- Only `questions[0]` is shown. Non-inline questions have no answer buttons. `filter(Boolean)` runs before the slice of 2.

### 1. Permission scope

Keep `respondToPermission` `"once"` and `"reject"`, the `busy` and `mountedRef` guard, question payloads `[[option.label]]`, dismiss, the risk badge, and optional Open.

Filter empty patterns once. Show that count in the summary. Put every remaining pattern on its own wrapping line (`break-all`) inside a native `details` element. Keep buttons out of `summary`.

When any pattern is omitted from the summary, render `details` open so the full scope is on screen before approval. Leave Allow and Deny enabled. A later collapse must not disable Deny. Leave question cards on their current path.

Compact cards also use CSS `truncate`, so two patterns can still be clipped. Default-open avoids a disabled-Allow trap and a resize observer. Keep disclosure clicks from reaching a parent row.

Acceptance: blank patterns do not affect the count; three or more patterns, or any clipped case, show the count and the full list; Allow still sends `"once"`; a failed response toasts once and clears `busy` only while mounted.

Tests: three patterns plus one blank; a long spaceless glob; compact Compare; double-click while busy; unmount during the request; a non-inline question has neither Allow nor a disclosure.

### 2. Status

Share a data map, not Mission Control’s fixed `w-28` chip. Keep each surface’s label keys and chrome.

Use warning plus the current shield or question icons for permission and question; one verified error token for error; info plus `file-check` for review; the success pulse dot for running; the muted dot for idle.

Acceptance: the same state has the same tone and icon-or-dot on Mission Control and Compare. Sidebar joins only if it already uses `SupervisionState`.

Tests: all six states; review is info and running is success in both places; the row error message still truncates.

### 3. Primary navigation

Add one labeled group, separate from `data-header-panels` and from services, sync, notifications, GitHub, and Open in app.

- Mission Control keeps `toggleMissionControl`, `pressed`, and `open_mission_control`.
- Review changes toggles the existing `diff` view and uses `supervision.inspector.changes`. Pressed means the split is enabled on `diff`.
- Add a session-workspace control only if unsupplied header code already has that action.

Keep both terminal entry points and `toggle_terminal`. Label only this primary group so the bar does not overflow. Keep the notification badge anchored to its icon.

Acceptance: the same stores and shortcuts still toggle; utility and project or browser actions remain visible.

Tests: Mission Control pressed state; review opens and closes diff; header and rail terminal agree; Open in app and services still render.

### 4. Mission Control density

Comfortable is the new default, with compact available. Drive it with a container query on the list.

Narrow comfortable rows: line 1 holds state, title, primary action, and working-set remove; line 2 holds project, evidence, age, and compare. Remove the project’s `hidden sm:block` treatment. Compact may stay one line when wide, and still wraps those fields when narrow.

Change the header from `h-12` to `min-h-12` with wrap. Keep dispatch, live and recent, working sets, create, rename, delete, and close in normal flow. Preserve Escape `stopPropagation` on the create and rename inputs.

Keep one `role="row"` with the current id, selection, expansion, grid focus, double-click open, and action `stopPropagation`.

Pitfall: the fixed `w-28`, `w-36`, `w-32`, and `w-16` columns block wrapping, and a parent may assume a 48px header. Comfortable default changes row height.

Tests: both densities at narrow container width; project and primary remain usable; row actions do not select the row; the grid’s active descendant still matches the row id; Escape in the create field does not close Mission Control.

### 5. Inspector rail

The collapsed default stays `w-10`, and mobile still renders nothing. Add one `aria-expanded` toggle as the first or last tab stop, outside the eight actions.

Order stays diff, files, git, board, plan, context, wiki, divider, terminal. Reuse the current click handler, `aria-pressed`, focus ring, 99+ diff badge, and terminal shortcut. Expanded labels use the existing i18n strings, a capped width, and truncation with the full name in `title` or `aria-label`. Do not repeat that name in a tooltip. Place the badge on the icon.

If expansion would collapse the chat, keep the icon rail. Do not bind Escape. Terminal continues to dock at the bottom and must not set `splitPaneRightTab`.

Tests: each view opens and closes; badge 0, 12, and 100; toggle keyboard; narrow width; mobile returns null.

New copy goes through `useI18n`. The shared status map and the card disclosure are the only extractions needed.
