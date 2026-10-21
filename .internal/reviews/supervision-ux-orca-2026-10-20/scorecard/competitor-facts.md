# Competitor facts (collected 2026-10-20 from official docs and source; V = verified in docs/source, I = inference)

## Orca (stablyai/orca; docs/site/content/docs)
- V Agent Dashboard: optional kanban (Settings > Experimental), columns Needs You / Working / Done / Idle (idle hidden by default),
  in-window or pop-out; toolbar search over worktree/project/agent; multi-select filters Project, Workspace status, PR/MR status with
  chips + Clear all; card: agent icon, session name, state glyph, last-message preview, project, worktree, age, review state; Needs-You
  tinted amber, Done green; click focuses the agent terminal; Codex/Claude subagents as child rows.
- V Shared state glyphs across tabs/sidebar/dashboard; Agents feed of events across worktrees with unread badge; header bell + dock badge;
  notifications on working->idle; mark unread.
- V Cmd-J worktree jump palette ordered needs-you > done > idle; Tab host/project filter; Shift-Enter opens in split; #PR search.
- V Sidebar grouped by project -> worktrees; filters; pin; multi-select (Cmd/Shift-click) worktrees and delete; per-worktree pane
  trees; tabs (terminal/editor/browser/diff/PR), drag to split; optional Chat UI over agent PTY.
- V Review: combined diff vs start ref, switchable compare base; image diffs; inline 3-way merge; optional file tree beside hunks;
  F7/Shift-F7 next/prev change; Source Control: stage/discard files, primary button Stage->Commit->Push, Cmd-Enter commit, PR composer;
  Annotate AI diff: hover + or `c`, Cmd-Enter save, comments pin to lines across edits, "Send to agent" batches notes with target picker,
  Resolve threads.

## opencode desktop (anomalyco/opencode, packages/app, session-ui, gui-extensions)
- V No multi-agent board. Home lists projects and recent sessions grouped Today/Yesterday/Older; rename/export/delete/archive; search.
- V Session tabs in titlebar with unread/progress; alt+up/down prev/next session, shift+alt+up/down next unseen; server-synced unread.
- V Permission/question prompts are per-session docks, no global inbox.
- V Layout: timeline + composer center, resizable right panel (terminal/review/files/browser extensions), no split panes.
- V Review panel: filterable resizable file tree with stats header, prev/next file with arrow hints, unified/split toggle, add/del/mix
  marks, modes git / branch / turn; line comments become composer chips sent with next prompt; session undo/redo/revert per turn.
  I No stage/discard/commit controls in review.

## Codex app (learn.chatgpt.com docs)
- V Parallel chats; shortcuts: next chat needing attention Cmd+Opt+A, clear unread, mark unread, Cmd+1-9, prev/next chat.
- V Worktrees per chat, permanent worktrees as projects; layouts full/split/hidden tabs; terminal, file tree, browser tabs.
- V Review pane: scopes Unstaged / Staged / Commit / Branch / Last turn; stage/unstage/revert all, per file, per hunk; click file opens
  editor; hover + comment then send follow-up; /review findings as inline comments.
- I Activity view of unread/running/waiting chats (unverified changelog).

## Claude Code desktop (code.claude.com/docs/en/desktop)
- V Sessions sidebar; Cmd-click opens a second session side by side; group and sort; archive; OS notification on finish.
- V Panes: chat, diff, browser, terminal, file, plan, tasks; drag/resize/pop-out panes; Changes card with line counts and PR CI.
- V Diff: click a line to comment, Enter adds, Cmd+Enter submits all; /code-review walk-through with Fix this one / Apply fixes;
  Create PR, Auto-fix, Merge when ready. No documented per-hunk stage/revert.
- V (Projects beta / agent view) state groups Ready for review / Waiting on you / Working; peek panel; dot on Overview when waiting.
