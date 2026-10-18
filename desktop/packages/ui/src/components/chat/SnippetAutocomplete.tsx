import React from "react"
import { cn, fuzzyMatch } from "@/lib/utils"
import { useSnippetsStore } from "@/stores/useSnippetsStore"
import { ScrollableOverlay } from "@/components/ui/ScrollableOverlay"
import { useI18n } from "@/lib/i18n"
import type { Snippet } from "@/types/snippet"

export interface SnippetAutocompleteHandle {
  handleKeyDown: (key: string) => boolean
}

interface SnippetAutocompleteProps {
  searchQuery: string
  onSnippetSelect: (snippet: Snippet, trigger: string) => void
  onClose: () => void
  style?: React.CSSProperties
}

function snippetPreview(snippet: Snippet): string {
  return (snippet.description || snippet.content).replace(/\s+/g, " ").trim().slice(0, 120)
}

export const SnippetAutocomplete = React.forwardRef<SnippetAutocompleteHandle, SnippetAutocompleteProps>(
  ({ searchQuery, onSnippetSelect, onClose, style }, ref) => {
    const { t } = useI18n()
    const containerRef = React.useRef<HTMLDivElement | null>(null)
    const [selectedIndex, setSelectedIndex] = React.useState(0)
    const selectedIndexRef = React.useRef(0)
    const [filteredSnippets, setFilteredSnippets] = React.useState<Snippet[]>([])
    const itemRefs = React.useRef<(HTMLDivElement | null)[]>([])
    const snippets = useSnippetsStore((s) => s.snippets)
    const loadSnippets = useSnippetsStore((s) => s.loadSnippets)

    React.useEffect(() => {
      void loadSnippets()
    }, [loadSnippets])

    React.useEffect(() => {
      const query = searchQuery.trim()
      const matches = query.length
        ? snippets.filter(
            (snippet) => fuzzyMatch(snippet.name, query) || snippet.aliases.some((alias) => fuzzyMatch(alias, query)),
          )
        : snippets
      const sortedMatches = [...matches].sort((a, b) => {
        if (a.source === "project" && b.source !== "project") return -1
        if (a.source !== "project" && b.source === "project") return 1
        return a.name.localeCompare(b.name)
      })
      setFilteredSnippets(sortedMatches)
      setSelectedIndex(0)
    }, [searchQuery, snippets])

    React.useEffect(() => {
      selectedIndexRef.current = selectedIndex
      itemRefs.current[selectedIndex]?.scrollIntoView({ block: "nearest" })
    }, [selectedIndex])

    React.useEffect(() => {
      const handlePointerDown = (event: MouseEvent | TouchEvent) => {
        const target = event.target as Node | null
        if (target && containerRef.current && !containerRef.current.contains(target)) onClose()
      }
      document.addEventListener("pointerdown", handlePointerDown, true)
      return () => document.removeEventListener("pointerdown", handlePointerDown, true)
    }, [onClose])

    const chooseSnippet = React.useCallback(
      (snippet: Snippet) => {
        const query = searchQuery.trim()
        const trigger = snippet.aliases.includes(query) ? query : snippet.name
        onSnippetSelect(snippet, trigger)
      },
      [onSnippetSelect, searchQuery],
    )

    React.useImperativeHandle(
      ref,
      () => ({
        handleKeyDown: (key: string) => {
          if (key === "Escape") {
            onClose()
            return true
          }
          const itemCount = filteredSnippets.length
          if (itemCount === 0) return key === "Tab"
          if (key === "ArrowDown") {
            setSelectedIndex((prev) => (prev + 1) % itemCount)
            return true
          }
          if (key === "ArrowUp") {
            setSelectedIndex((prev) => (prev - 1 + itemCount) % itemCount)
            return true
          }
          if (key === "Enter" || key === "Tab") {
            const snippet = filteredSnippets[selectedIndexRef.current]
            if (snippet) chooseSnippet(snippet)
            return true
          }
          return false
        },
      }),
      [chooseSnippet, filteredSnippets, onClose],
    )

    return (
      <div
        ref={containerRef}
        className="absolute z-[100] min-w-0 w-full max-w-[450px] max-h-60 bg-background border-2 border-border/60 rounded-xl shadow-none bottom-full mb-2 left-0 flex flex-col"
        style={style}
      >
        <ScrollableOverlay outerClassName="flex-1 min-h-0" className="px-0 pb-2">
          {filteredSnippets.length ? (
            filteredSnippets.map((snippet, index) => (
              <div
                key={`${snippet.source}:${snippet.filePath}`}
                ref={(el) => {
                  itemRefs.current[index] = el
                }}
                className={cn(
                  "flex items-start gap-2 px-3 py-1.5 cursor-pointer rounded-lg typography-ui-label",
                  index === selectedIndex && "bg-interactive-selection",
                )}
                onClick={() => chooseSnippet(snippet)}
                onMouseMove={() => setSelectedIndex(index)}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold truncate">#{snippet.name}</span>
                    <span className="typography-micro leading-none uppercase font-bold tracking-tight px-1.5 py-1 rounded border flex-shrink-0 bg-[var(--surface-muted)] text-muted-foreground border-[var(--interactive-border)]/60">
                      {t(`snippets.source.${snippet.source}`)}
                    </span>
                  </div>
                  <div className="typography-meta text-muted-foreground mt-0.5 truncate">{snippetPreview(snippet)}</div>
                </div>
              </div>
            ))
          ) : (
            <div className="px-3 py-2 typography-ui-label text-muted-foreground">
              {t("chat.snippetAutocomplete.empty")}
            </div>
          )}
        </ScrollableOverlay>
        <div className="px-3 pt-1 pb-1.5 border-t typography-meta text-muted-foreground">
          {t("chat.snippetAutocomplete.footer")}
        </div>
      </div>
    )
  },
)

SnippetAutocomplete.displayName = "SnippetAutocomplete"
