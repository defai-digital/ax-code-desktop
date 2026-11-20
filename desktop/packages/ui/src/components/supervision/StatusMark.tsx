import { cn } from "@/lib/utils"

/**
 * The supervision status shapes. Each state has its own outline, so a state stays readable in greyscale and under
 * red-green colour blindness; the status colour only reinforces it. A mark never stands alone: the state word is
 * printed next to it in the foreground colour.
 */
export type StatusMarkKind = "needs" | "review" | "failed" | "stale" | "running" | "idle"

const TONE: Record<StatusMarkKind, string> = {
  needs: "text-[var(--status-warning)]",
  review: "text-[var(--status-info)]",
  failed: "text-[var(--status-error)]",
  // Stale is not a failure and not a request: nothing is known to be wrong, the result has expired.
  stale: "text-muted-foreground",
  running: "text-[var(--status-info)]",
  idle: "text-muted-foreground",
}

interface StatusMarkProps {
  kind: StatusMarkKind
  className?: string
}

export function StatusMark(props: StatusMarkProps) {
  const { kind, className } = props
  return (
    <svg
      viewBox="0 0 12 12"
      aria-hidden="true"
      data-status-mark={kind}
      className={cn("h-3 w-3 shrink-0", TONE[kind], className)}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {kind === "needs" ? <path d="M6 0.75 11.25 6 6 11.25 0.75 6Z" fill="currentColor" stroke="none" /> : null}
      {kind === "review" ? <path d="M6 1.5 10.5 6 6 10.5 1.5 6Z" /> : null}
      {kind === "failed" ? (
        <>
          <circle cx="6" cy="6" r="5.25" fill="currentColor" stroke="none" />
          <path d="M4 4 8 8M8 4 4 8" stroke="var(--background)" />
        </>
      ) : null}
      {kind === "stale" ? (
        <>
          <circle cx="6" cy="6" r="4.5" />
          <path d="M6 1.5A4.5 4.5 0 0 0 6 10.5Z" fill="currentColor" stroke="none" />
        </>
      ) : null}
      {kind === "running" ? (
        <>
          <circle cx="6" cy="6" r="4.5" opacity="0.3" />
          <path d="M6 1.5A4.5 4.5 0 0 1 10.5 6" />
        </>
      ) : null}
      {kind === "idle" ? <circle cx="6" cy="6" r="3.5" /> : null}
    </svg>
  )
}
