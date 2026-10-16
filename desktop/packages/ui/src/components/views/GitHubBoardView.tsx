import React from "react"

import { Icon } from "@/components/icon/Icon"
import {
  buildIssueWorkContext,
  buildPullRequestWorkContext,
  startGitHubWorkSession,
} from "@/components/session/githubWorkSession"
import { SimpleMarkdownRenderer } from "@/components/chat/MarkdownRenderer"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { ViewLoadingSkeleton } from "@/components/ui/ViewLoadingSkeleton"
import { toast } from "@/components/ui"
import { useEffectiveDirectory } from "@/hooks/useEffectiveDirectory"
import { useRuntimeAPIs } from "@/hooks/useRuntimeAPIs"
import type {
  GitHubChecksSummary,
  GitHubIssue,
  GitHubIssueComment,
  GitHubIssueLabel,
  GitHubIssuesListResult,
  GitHubPullRequestContextResult,
  GitHubRepoSelector,
} from "@/lib/api/types"
import { useI18n } from "@/lib/i18n"
import { formatRelativeAge } from "@/lib/supervision/relativeAge"
import { getSafeExternalUrl, openExternalUrl } from "@/lib/url"
import { cn } from "@/lib/utils"
import { useGitHubAuthStore } from "@/stores/useGitHubAuthStore"
import { useUIStore } from "@/stores/useUIStore"

import {
  boardComments,
  boardItemKey,
  buildBoardListOptions,
  labelChipStyle,
  visibleLabels,
  type BoardComment,
  type BoardKind,
  type IssueStateFilter,
  type PullStateFilter,
} from "./github-board/boardModel"

type BoardRow = {
  key: string
  number: number
  title: string
  url: string
  state: "open" | "closed" | "merged"
  updatedAt?: string
  author?: string
  labels: GitHubIssueLabel[]
  draft: boolean
  reviewRequested?: number
  sourceRepo?: (GitHubRepoSelector & { source?: string }) | null
}

const sourceRepoOption = (row: BoardRow | null): GitHubRepoSelector | null => {
  if (!row?.sourceRepo?.owner || !row.sourceRepo.repo) return null
  return { owner: row.sourceRepo.owner, repo: row.sourceRepo.repo }
}

const dedupeRows = (rows: BoardRow[]): BoardRow[] => {
  const seen = new Set<string>()
  const next: BoardRow[] = []
  for (const row of rows) {
    if (seen.has(row.key)) continue
    seen.add(row.key)
    next.push(row)
  }
  return next
}

function LabelChips({ labels }: { labels: GitHubIssueLabel[] }) {
  const chips = visibleLabels(labels, 4)
  if (chips.shown.length === 0) return null
  return (
    <span className="flex min-w-0 flex-wrap gap-1">
      {chips.shown.map((label) => {
        const style = labelChipStyle(label.color)
        return (
          <span
            key={label.name}
            className={cn(
              "inline-flex max-w-full truncate rounded px-1.5 py-0.5 typography-micro",
              !style && "bg-muted text-muted-foreground",
            )}
            style={style ?? undefined}
          >
            {label.name}
          </span>
        )
      })}
      {chips.extra > 0 ? <span className="typography-micro text-muted-foreground">+{chips.extra}</span> : null}
    </span>
  )
}

function updatedLabel(iso: string | undefined, t: ReturnType<typeof useI18n>["t"]): string {
  if (!iso) return ""
  const parsed = Date.parse(iso)
  if (!Number.isFinite(parsed)) return ""
  return t("githubBoard.meta.updated", { when: formatRelativeAge(Date.now() - parsed, t) })
}

export function GitHubBoardView() {
  const { t } = useI18n()
  const directory = useEffectiveDirectory()
  const { github } = useRuntimeAPIs()
  const githubAuthStatus = useGitHubAuthStore((state) => state.status)
  const githubAuthChecked = useGitHubAuthStore((state) => state.hasChecked)
  const setSettingsDialogOpen = useUIStore((state) => state.setSettingsDialogOpen)
  const setSettingsPage = useUIStore((state) => state.setSettingsPage)
  const setActiveMainTab = useUIStore((state) => state.setActiveMainTab)
  const isMobile = useUIStore((state) => state.isMobile)

  const [kind, setKind] = React.useState<BoardKind>("issues")
  const [issueState, setIssueState] = React.useState<IssueStateFilter>("open")
  const [pullState, setPullState] = React.useState<PullStateFilter>("open")
  const [labelInput, setLabelInput] = React.useState("")
  const [queryInput, setQueryInput] = React.useState("")
  const [label, setLabel] = React.useState("")
  const [query, setQuery] = React.useState("")
  const [page, setPage] = React.useState(1)
  const [rows, setRows] = React.useState<BoardRow[]>([])
  const [hasMore, setHasMore] = React.useState(false)
  const [loading, setLoading] = React.useState(false)
  const [loadingMore, setLoadingMore] = React.useState(false)
  const [listError, setListError] = React.useState<string | null>(null)
  const [connected, setConnected] = React.useState(true)
  const [repoMissing, setRepoMissing] = React.useState(false)
  const [runtimeMissing, setRuntimeMissing] = React.useState(false)
  const [selected, setSelected] = React.useState<BoardRow | null>(null)
  const [detailLoading, setDetailLoading] = React.useState(false)
  const [detailError, setDetailError] = React.useState<string | null>(null)
  const [issueBundle, setIssueBundle] = React.useState<{
    repo: GitHubIssuesListResult["repo"]
    issue: GitHubIssue
    comments: GitHubIssueComment[]
  } | null>(null)
  const [prBundle, setPrBundle] = React.useState<GitHubPullRequestContextResult | null>(null)
  const [commentBody, setCommentBody] = React.useState("")
  const [commentSending, setCommentSending] = React.useState(false)
  const [statePending, setStatePending] = React.useState(false)
  const [starting, setStarting] = React.useState(false)
  const [reloadNonce, setReloadNonce] = React.useState(0)

  const listRequestRef = React.useRef(0)
  const detailRequestRef = React.useRef(0)

  React.useEffect(() => {
    const timer = window.setTimeout(() => {
      const nextLabel = labelInput.trim()
      const nextQuery = queryInput.trim()
      setLabel((current) => (current === nextLabel ? current : nextLabel))
      setQuery((current) => (current === nextQuery ? current : nextQuery))
    }, 300)
    return () => window.clearTimeout(timer)
  }, [labelInput, queryInput])

  const filters = React.useMemo(
    () =>
      kind === "issues"
        ? { kind, state: issueState, label, query, page: 1 }
        : { kind, state: pullState, query, page: 1 },
    [issueState, kind, label, pullState, query],
  )

  const applyListPayload = React.useCallback(
    (
      payload: { connected?: boolean; repo?: unknown; issues?: unknown; prs?: unknown; hasMore?: boolean },
      append: boolean,
    ) => {
      if (payload.connected === false) {
        setConnected(false)
        setRows([])
        setHasMore(false)
        return
      }
      setConnected(true)
      if (payload.repo == null) {
        setRepoMissing(true)
        setRows([])
        setHasMore(false)
        return
      }
      setRepoMissing(false)
      const raw = kind === "issues" ? payload.issues : payload.prs
      const mapped = Array.isArray(raw)
        ? raw.map((item) => mapRow(item as never)).filter((row): row is BoardRow => row !== null)
        : []
      setRows((current) => (append ? dedupeRows([...current, ...mapped]) : mapped))
      setHasMore(Boolean(payload.hasMore))
    },
    [kind],
  )

  React.useEffect(() => {
    const requestId = ++listRequestRef.current
    setSelected(null)
    setIssueBundle(null)
    setPrBundle(null)
    setDetailError(null)
    setPage(1)

    if (!directory) {
      setLoading(false)
      setRows([])
      setListError(null)
      setRepoMissing(false)
      return
    }
    if (githubAuthChecked && githubAuthStatus?.connected === false) {
      setConnected(false)
      setRows([])
      setLoading(false)
      setListError(null)
      return
    }
    if (!github?.issuesList || !github.prsList) {
      setRuntimeMissing(true)
      setLoading(false)
      return
    }
    setRuntimeMissing(false)
    setConnected(true)
    setLoading(true)
    setListError(null)

    const load =
      filters.kind === "issues"
        ? github.issuesList(directory, buildBoardListOptions(filters))
        : github.prsList(directory, buildBoardListOptions(filters))
    void load
      .then((payload) => {
        if (listRequestRef.current !== requestId) return
        applyListPayload(payload, false)
      })
      .catch((error: unknown) => {
        if (listRequestRef.current !== requestId) return
        setListError(error instanceof Error ? error.message : t("githubBoard.error.loadFailed"))
        setRows([])
      })
      .finally(() => {
        if (listRequestRef.current === requestId) setLoading(false)
      })
  }, [
    applyListPayload,
    directory,
    filters,
    github,
    githubAuthChecked,
    githubAuthStatus?.connected,
    kind,
    reloadNonce,
    t,
  ])

  const loadMore = () => {
    if (!directory || !github || loadingMore || !hasMore) return
    const requestId = listRequestRef.current
    const nextPage = page + 1
    setLoadingMore(true)
    const load =
      filters.kind === "issues"
        ? github.issuesList(directory, buildBoardListOptions({ ...filters, page: nextPage }))
        : github.prsList(directory, buildBoardListOptions({ ...filters, page: nextPage }))
    void load
      .then((payload) => {
        if (listRequestRef.current !== requestId) return
        applyListPayload(payload, true)
        setPage(nextPage)
      })
      .catch((error: unknown) => {
        if (listRequestRef.current !== requestId) return
        toast.error(t("githubBoard.error.loadFailed"), {
          description: error instanceof Error ? error.message : undefined,
        })
      })
      .finally(() => {
        if (listRequestRef.current === requestId) setLoadingMore(false)
      })
  }

  React.useEffect(() => {
    if (!selected || !directory || !github) return
    const requestId = ++detailRequestRef.current
    const sourceRepo = sourceRepoOption(selected)
    setDetailLoading(true)
    setDetailError(null)
    setIssueBundle(null)
    setPrBundle(null)
    setCommentBody("")

    const load =
      kind === "issues"
        ? Promise.all([
            github.issueGet(directory, selected.number, { sourceRepo }),
            github.issueComments(directory, selected.number, { sourceRepo }),
          ]).then(([issueResult, commentsResult]) => {
            if (detailRequestRef.current !== requestId) return
            if (issueResult.connected === false || commentsResult.connected === false) {
              setConnected(false)
              return
            }
            if (!issueResult.issue) {
              setDetailError(t("githubBoard.error.detailFailed"))
              return
            }
            setIssueBundle({
              repo: issueResult.repo,
              issue: issueResult.issue,
              comments: commentsResult.comments ?? [],
            })
          })
        : github
            .prContext(directory, selected.number, { includeDiff: false, includeCheckDetails: false, sourceRepo })
            .then((context) => {
              if (detailRequestRef.current !== requestId) return
              if (context.connected === false) {
                setConnected(false)
                return
              }
              if (!context.pr) {
                setDetailError(t("githubBoard.error.detailFailed"))
                return
              }
              setPrBundle(context)
            })

    void Promise.resolve(load)
      .catch((error: unknown) => {
        if (detailRequestRef.current !== requestId) return
        setDetailError(error instanceof Error ? error.message : t("githubBoard.error.detailFailed"))
      })
      .finally(() => {
        if (detailRequestRef.current === requestId) setDetailLoading(false)
      })
  }, [directory, github, kind, selected, t])

  const openGitHubSettings = () => {
    setSettingsPage("git")
    setSettingsDialogOpen(true)
  }

  const detail = React.useMemo(() => readDetail(kind, issueBundle, prBundle), [issueBundle, kind, prBundle])

  const submitComment = () => {
    if (!directory || !github || !selected || commentSending) return
    const body = commentBody.trim()
    if (!body) return
    setCommentSending(true)
    void github
      .issueComment({ directory, number: selected.number, body, sourceRepo: sourceRepoOption(selected) })
      .then((result) => {
        if (result.connected === false) {
          setConnected(false)
          return
        }
        if (!result.comment) throw new Error(t("githubBoard.error.commentFailed"))
        const created = result.comment
        if (kind === "issues") {
          setIssueBundle((current) => (current ? { ...current, comments: [...current.comments, created] } : current))
        } else {
          setPrBundle((current) =>
            current ? { ...current, issueComments: [...(current.issueComments ?? []), created] } : current,
          )
        }
        setCommentBody("")
        toast.success(t("githubBoard.toast.commentAdded"))
      })
      .catch((error: unknown) => {
        toast.error(t("githubBoard.error.commentFailed"), {
          description: error instanceof Error ? error.message : undefined,
        })
      })
      .finally(() => setCommentSending(false))
  }

  const changeState = (state: "open" | "closed") => {
    if (!directory || !github || !selected || statePending) return
    setStatePending(true)
    void github
      .issueSetState({ directory, number: selected.number, state, sourceRepo: sourceRepoOption(selected) })
      .then((result) => {
        if (result.connected === false) {
          setConnected(false)
          return
        }
        const nextState = result.issue?.state
        if (nextState !== "open" && nextState !== "closed") throw new Error(t("githubBoard.error.stateFailed"))
        setRows((current) => current.map((row) => (row.key === selected.key ? { ...row, state: nextState } : row)))
        setSelected((current) => (current ? { ...current, state: nextState } : current))
        if (kind === "issues" && issueBundle) {
          setIssueBundle({ ...issueBundle, issue: { ...issueBundle.issue, state: nextState } })
        } else if (prBundle?.pr && nextState) {
          setPrBundle({ ...prBundle, pr: { ...prBundle.pr, state: nextState } })
        }
        toast.success(state === "closed" ? t("githubBoard.toast.closed") : t("githubBoard.toast.reopened"))
      })
      .catch((error: unknown) => {
        toast.error(t("githubBoard.error.stateFailed"), {
          description: error instanceof Error ? error.message : undefined,
        })
      })
      .finally(() => setStatePending(false))
  }

  const startSession = () => {
    if (!directory || !selected || starting) return
    const title = `#${selected.number} ${selected.title}`.trim()
    setStarting(true)
    const onDeliveryError = (error: unknown) => {
      toast.error(t("githubBoard.error.startFailed"), {
        description: error instanceof Error ? error.message : undefined,
      })
    }
    const run =
      kind === "issues" && issueBundle
        ? startGitHubWorkSession({
            directory,
            title,
            contextText: buildIssueWorkContext(issueBundle),
            prompt: {
              visible: "github.issue.review.visible",
              instructions: "github.issue.review.instructions",
              vars: { issue_number: String(selected.number) },
            },
            onDeliveryError,
          })
        : kind === "pulls" && prBundle
          ? startGitHubWorkSession({
              directory,
              title,
              contextText: buildPullRequestWorkContext(prBundle),
              prompt: {
                visible: "github.pr.review.visible",
                instructions: "github.pr.review.instructions",
                vars: { pr_number: String(selected.number) },
              },
              onDeliveryError,
            })
          : null
    if (!run) {
      setStarting(false)
      return
    }
    void run
      .then((result) => {
        if (!result.delivered) {
          toast.error(t("githubBoard.error.noModel"))
          return
        }
        toast.success(t("githubBoard.toast.sessionStarted"))
        if (isMobile) setActiveMainTab("chat")
      })
      .catch((error: unknown) => {
        toast.error(t("githubBoard.error.startFailed"), {
          description: error instanceof Error ? error.message : undefined,
        })
      })
      .finally(() => setStarting(false))
  }

  const stateFilters: Array<{ id: string; label: string }> =
    kind === "issues"
      ? [
          { id: "open", label: t("githubBoard.filter.open") },
          { id: "closed", label: t("githubBoard.filter.closed") },
        ]
      : [
          { id: "open", label: t("githubBoard.filter.open") },
          { id: "closed", label: t("githubBoard.filter.closed") },
          { id: "merged", label: t("githubBoard.filter.merged") },
        ]
  const activeState = kind === "issues" ? issueState : pullState
  const safeUrl = detail?.url ? getSafeExternalUrl(detail.url) : null
  const showStateActions = detail && detail.state !== "merged"

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <div className="flex flex-shrink-0 flex-col gap-2 border-b border-border/40 px-3 py-2">
        <div className="flex items-center gap-2">
          <h1 className="typography-ui-label font-medium text-foreground">{t("githubBoard.title")}</h1>
          <div className="ml-auto flex items-center gap-1">
            <Button type="button" variant="ghost" size="xs" onClick={() => setReloadNonce((current) => current + 1)}>
              {t("githubBoard.actions.refresh")}
            </Button>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-1">
          {(
            [
              ["issues", t("githubBoard.tab.issues")],
              ["pulls", t("githubBoard.tab.pulls")],
            ] as const
          ).map(([id, labelText]) => (
            <Button
              key={id}
              type="button"
              size="xs"
              variant="chip"
              aria-pressed={kind === id}
              onClick={() => setKind(id)}
            >
              {labelText}
            </Button>
          ))}
          <span className="mx-1 h-4 w-px bg-border/60" aria-hidden />
          {stateFilters.map((filter) => (
            <Button
              key={filter.id}
              type="button"
              size="xs"
              variant="chip"
              aria-pressed={activeState === filter.id}
              onClick={() => {
                if (kind === "issues") setIssueState(filter.id === "closed" ? "closed" : "open")
                else setPullState(filter.id === "closed" || filter.id === "merged" ? filter.id : "open")
              }}
            >
              {filter.label}
            </Button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Input
            value={queryInput}
            onChange={(event) => setQueryInput(event.target.value)}
            placeholder={t("githubBoard.filter.searchPlaceholder")}
            aria-label={t("githubBoard.filter.searchPlaceholder")}
            className="h-8 min-w-40 flex-1"
          />
          {kind === "issues" ? (
            <Input
              value={labelInput}
              onChange={(event) => setLabelInput(event.target.value)}
              placeholder={t("githubBoard.filter.labelPlaceholder")}
              aria-label={t("githubBoard.filter.labelPlaceholder")}
              className="h-8 w-36"
            />
          ) : null}
        </div>
      </div>

      {!directory ? <EmptyMessage message={t("githubBoard.empty.noProject")} /> : null}
      {directory && runtimeMissing ? <EmptyMessage message={t("githubBoard.empty.runtimeUnavailable")} /> : null}
      {directory && !runtimeMissing && !connected ? (
        <EmptyMessage
          message={t("githubBoard.empty.notConnected")}
          actionLabel={t("githubBoard.actions.openSettings")}
          onAction={openGitHubSettings}
        />
      ) : null}
      {directory && connected && repoMissing ? <EmptyMessage message={t("githubBoard.empty.notGitHub")} /> : null}

      {directory && connected && !repoMissing && !runtimeMissing ? (
        <div className="grid min-h-0 flex-1 grid-cols-[minmax(12rem,18rem)_minmax(0,1fr)]">
          <div className="min-h-0 overflow-y-auto border-r border-border/40">
            {loading ? <ViewLoadingSkeleton rows={6} label={t("common.loading")} /> : null}
            {!loading && listError ? (
              <p className="px-3 py-6 text-center typography-meta text-muted-foreground">{listError}</p>
            ) : null}
            {!loading && !listError && rows.length === 0 ? (
              <p className="px-3 py-6 text-center typography-meta text-muted-foreground">
                {kind === "issues" ? t("githubBoard.empty.noIssues") : t("githubBoard.empty.noPulls")}
              </p>
            ) : null}
            <ul className="flex flex-col">
              {rows.map((row) => {
                const active = selected?.key === row.key
                return (
                  <li key={row.key}>
                    <button
                      type="button"
                      onClick={() => setSelected(row)}
                      aria-current={active ? "true" : undefined}
                      className={cn(
                        "flex w-full flex-col gap-1 px-3 py-2 text-left transition-colors",
                        active ? "bg-interactive-hover" : "hover:bg-interactive-hover/50",
                      )}
                    >
                      <span className="flex items-baseline gap-2">
                        <span className="typography-micro text-muted-foreground">#{row.number}</span>
                        <span className="min-w-0 flex-1 truncate typography-meta text-foreground">{row.title}</span>
                      </span>
                      <LabelChips labels={row.labels} />
                      <span className="flex flex-wrap items-center gap-x-2 typography-micro text-muted-foreground">
                        <span>{row.author || t("githubBoard.author.unknown")}</span>
                        {row.updatedAt ? <span>{updatedLabel(row.updatedAt, t)}</span> : null}
                        {row.draft ? <span>{t("githubBoard.badge.draft")}</span> : null}
                        {row.reviewRequested ? (
                          <span>{t("githubBoard.badge.reviewRequested", { count: row.reviewRequested })}</span>
                        ) : null}
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
            {hasMore ? (
              <div className="p-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="w-full"
                  disabled={loadingMore}
                  onClick={loadMore}
                >
                  {loadingMore ? t("common.loading") : t("githubBoard.actions.loadMore")}
                </Button>
              </div>
            ) : null}
          </div>

          <div className="min-h-0 overflow-y-auto">
            {!selected ? <EmptyMessage message={t("githubBoard.empty.selectItem")} /> : null}
            {selected && detailLoading ? <ViewLoadingSkeleton rows={4} label={t("common.loading")} /> : null}
            {selected && !detailLoading && detailError ? (
              <p className="px-4 py-6 typography-meta text-muted-foreground">{detailError}</p>
            ) : null}
            {selected && !detailLoading && detail ? (
              <article className="flex flex-col gap-4 px-4 py-3">
                <header className="flex flex-col gap-2">
                  <div className="flex flex-wrap items-start gap-2">
                    <h2 className="min-w-0 flex-1 typography-ui-label text-foreground">
                      <span className="text-muted-foreground">#{detail.number}</span> {detail.title}
                    </h2>
                    {detail.draft ? (
                      <span className="rounded bg-muted px-1.5 py-0.5 typography-micro text-muted-foreground">
                        {t("githubBoard.badge.draft")}
                      </span>
                    ) : null}
                  </div>
                  <LabelChips labels={detail.labels} />
                  <p className="typography-micro text-muted-foreground">
                    {detail.author || t("githubBoard.author.unknown")}
                    {detail.updatedAt ? ` · ${updatedLabel(detail.updatedAt, t)}` : ""}
                  </p>
                  {detail.checks ? (
                    <p className="typography-micro text-muted-foreground">
                      {t("githubBoard.checks.summary", {
                        success: detail.checks.success,
                        failure: detail.checks.failure,
                        pending: detail.checks.pending,
                      })}
                    </p>
                  ) : null}
                  <div className="flex flex-wrap gap-2">
                    {safeUrl ? (
                      <Button type="button" variant="outline" size="xs" onClick={() => void openExternalUrl(safeUrl)}>
                        <Icon name="external-link" className="h-3.5 w-3.5" />
                        {t("githubBoard.actions.openOnGitHub")}
                      </Button>
                    ) : null}
                    <Button
                      type="button"
                      variant="outline"
                      size="xs"
                      disabled={starting || !detailReady(kind, issueBundle, prBundle)}
                      onClick={startSession}
                    >
                      {t("githubBoard.actions.startSession")}
                    </Button>
                    {showStateActions && detail.state === "open" ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="xs"
                        disabled={statePending}
                        onClick={() => changeState("closed")}
                      >
                        {t("githubBoard.actions.close")}
                      </Button>
                    ) : null}
                    {showStateActions && detail.state === "closed" ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="xs"
                        disabled={statePending}
                        onClick={() => changeState("open")}
                      >
                        {t("githubBoard.actions.reopen")}
                      </Button>
                    ) : null}
                  </div>
                </header>
                <div className="typography-markdown text-foreground">
                  {detail.body.trim() ? (
                    <SimpleMarkdownRenderer content={detail.body} />
                  ) : (
                    <p className="text-muted-foreground">{t("githubBoard.empty.noBody")}</p>
                  )}
                </div>
                <section className="flex flex-col gap-3">
                  {detail.comments.length === 0 ? (
                    <p className="typography-meta text-muted-foreground">{t("githubBoard.empty.noComments")}</p>
                  ) : (
                    detail.comments.map((comment) => <CommentCard key={comment.id} comment={comment} />)
                  )}
                  <Textarea
                    simple
                    value={commentBody}
                    onChange={(event) => setCommentBody(event.target.value)}
                    placeholder={t("githubBoard.actions.commentPlaceholder")}
                    aria-label={t("githubBoard.actions.commentPlaceholder")}
                    rows={3}
                    onKeyDown={(event) => {
                      if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
                        event.preventDefault()
                        submitComment()
                      }
                    }}
                  />
                  <div>
                    <Button
                      type="button"
                      size="sm"
                      disabled={commentSending || commentBody.trim().length === 0}
                      onClick={submitComment}
                    >
                      {t("githubBoard.actions.comment")}
                    </Button>
                  </div>
                </section>
              </article>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  )
}

function EmptyMessage({
  message,
  actionLabel,
  onAction,
}: {
  message: string
  actionLabel?: string
  onAction?: () => void
}) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
      <p className="typography-meta text-muted-foreground">{message}</p>
      {actionLabel && onAction ? (
        <Button type="button" variant="outline" size="sm" onClick={onAction}>
          {actionLabel}
        </Button>
      ) : null}
    </div>
  )
}

function CommentCard({ comment }: { comment: BoardComment }) {
  const { t } = useI18n()
  return (
    <div className="rounded-lg border border-border/50 px-3 py-2">
      <p className="mb-1 typography-micro text-muted-foreground">
        {comment.authorLogin || t("githubBoard.author.unknown")}
        {comment.createdAt ? ` · ${updatedLabel(comment.createdAt, t)}` : ""}
      </p>
      {comment.body.trim() ? <SimpleMarkdownRenderer content={comment.body} /> : null}
    </div>
  )
}

function mapRow(item: {
  number?: number
  title?: string
  url?: string
  state?: string
  updatedAt?: string
  author?: { login?: string } | null
  labels?: GitHubIssueLabel[]
  draft?: boolean
  review?: { requested?: number }
  sourceRepo?: BoardRow["sourceRepo"]
}): BoardRow | null {
  if (typeof item.number !== "number" || !item.title || !item.url) return null
  const state = item.state === "closed" || item.state === "merged" ? item.state : "open"
  return {
    key: boardItemKey({ number: item.number, sourceRepo: item.sourceRepo }),
    number: item.number,
    title: item.title,
    url: item.url,
    state,
    updatedAt: item.updatedAt,
    author: item.author?.login,
    labels: item.labels ?? [],
    draft: Boolean(item.draft),
    reviewRequested: item.review && item.review.requested ? item.review.requested : undefined,
    sourceRepo: item.sourceRepo,
  }
}

function readDetail(
  kind: BoardKind,
  issueBundle: { issue: GitHubIssue; comments: GitHubIssueComment[] } | null,
  prBundle: GitHubPullRequestContextResult | null,
): {
  number: number
  title: string
  url: string
  state: "open" | "closed" | "merged"
  body: string
  author?: string
  labels: GitHubIssueLabel[]
  updatedAt?: string
  draft: boolean
  comments: BoardComment[]
  checks: GitHubChecksSummary | null
} | null {
  if (kind === "issues" && issueBundle) {
    return {
      number: issueBundle.issue.number,
      title: issueBundle.issue.title,
      url: issueBundle.issue.url,
      state: issueBundle.issue.state,
      body: issueBundle.issue.body ?? "",
      author: issueBundle.issue.author?.login,
      labels: issueBundle.issue.labels ?? [],
      updatedAt: issueBundle.issue.updatedAt,
      draft: false,
      comments: boardComments({ issueComments: issueBundle.comments }),
      checks: null,
    }
  }
  if (kind === "pulls" && prBundle?.pr) {
    return {
      number: prBundle.pr.number,
      title: prBundle.pr.title,
      url: prBundle.pr.url,
      state: prBundle.pr.state,
      body: prBundle.pr.body ?? "",
      author: prBundle.pr.author?.login,
      labels: prBundle.pr.labels ?? [],
      updatedAt: prBundle.pr.updatedAt,
      draft: prBundle.pr.draft,
      comments: boardComments({ issueComments: prBundle.issueComments, reviewComments: prBundle.reviewComments }),
      checks: prBundle.checks ?? null,
    }
  }
  return null
}

function detailReady(
  kind: BoardKind,
  issueBundle: { issue: GitHubIssue } | null,
  prBundle: GitHubPullRequestContextResult | null,
): boolean {
  return kind === "issues" ? Boolean(issueBundle) : Boolean(prBundle?.pr)
}
