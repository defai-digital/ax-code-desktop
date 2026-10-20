import React from "react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Icon } from "@/components/icon/Icon"
import { useProjectsStore } from "@/stores/useProjectsStore"
import { cn } from "@/lib/utils"
import { useI18n } from "@/lib/i18n"

const formatProjectLabel = (label: string): string => {
  return label.replace(/[-_]/g, " ").replace(/\b\w/g, (char) => char.toUpperCase())
}

export const SettingsProjectSelector: React.FC<{ className?: string }> = ({ className }) => {
  const { t } = useI18n()
  const projects = useProjectsStore((state) => state.projects)
  const activeProjectId = useProjectsStore((state) => state.activeProjectId)
  const setActiveProject = useProjectsStore((state) => state.setActiveProject)

  const sortedProjects = React.useMemo(() => {
    const entries = [...projects].sort((a, b) => (a.label || a.path).localeCompare(b.label || b.path)).map(project => {
      const raw = project.label?.trim() || project.path.split("/").filter(Boolean).pop() || project.path ||
        t("settings.shared.projectSelector.fallbackProject")
      return { ...project, displayLabel: formatProjectLabel(raw).replace(/\s+/g, " ").trim() }
    })
    const counts = new Map<string, number>()
    for (const project of entries) counts.set(project.displayLabel, (counts.get(project.displayLabel) ?? 0) + 1)
    return entries.map(project => ({ ...project, ambiguous: (counts.get(project.displayLabel) ?? 0) > 1 }))
  }, [projects, t])

  const activeProject = React.useMemo(() => {
    if (sortedProjects.length === 0) {
      return null
    }
    return sortedProjects.find((p) => p.id === activeProjectId) ?? sortedProjects[0]
  }, [activeProjectId, sortedProjects])

  if (sortedProjects.length === 0) {
    return null
  }

  const label = activeProject?.displayLabel

  return (
    <div className={cn(className)}>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label={t("settings.shared.projectSelector.switchProjectAria")}
            title={t("settings.shared.projectSelector.switchProjectTitle")}
            className={cn(
              // Mirror Input sizing so headers align visually.
              "text-foreground border border-border/80 appearance-none flex min-h-8 w-full min-w-0 rounded-lg bg-transparent px-3 py-1 outline-none",
              "hover:border-input focus-visible:ring-1 focus-visible:ring-primary/50 focus-visible:border-primary/70",
              "flex items-center gap-1.5 text-left",
            )}
          >
            <Icon name="folder" className="h-4 w-4 shrink-0 opacity-70" />
            <span className="min-w-0 flex-1">
              <span className="block break-all typography-ui-label font-medium">{label}</span>
              {activeProject?.ambiguous ? <span className="block break-all font-mono typography-micro text-muted-foreground">{activeProject.path}</span> : null}
            </span>
            <Icon name="arrow-down-s" className="size-4 shrink-0 opacity-50" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-96 max-w-[calc(100vw-2rem)]">
          <DropdownMenuRadioGroup
            value={activeProject?.id ?? ""}
            onValueChange={(value) => {
              if (!value) return
              setActiveProject(value)
            }}
          >
            {sortedProjects.map((project) => {
              const itemLabel = project.displayLabel
              return (
                <DropdownMenuRadioItem key={project.id} value={project.id} closeOnClick
                  aria-label={project.ambiguous ? `${itemLabel} · ${project.path}` : itemLabel}>
                  <span className="min-w-0">
                    <span className="block break-all typography-ui-label">{itemLabel}</span>
                    {project.ambiguous ? <span className="block break-all font-mono typography-micro text-muted-foreground">{project.path}</span> : null}
                  </span>
                </DropdownMenuRadioItem>
              )
            })}
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
